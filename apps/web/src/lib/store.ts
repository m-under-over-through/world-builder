import Dexie, { type Table } from 'dexie';
import { EVENT_RETENTION_DAYS, type Event, type Session } from '@wb/contracts';

/**
 * Storage on the device, one database per workshop (namespaced by slug, ADR 0004).
 * - settings: the code, the wave or invite the person arrived with, consent.
 * - sessions and events: what has been done. `synced` is 0 until the server accepted the row.
 *   Accepted rows are kept for EVENT_RETENTION_DAYS and re-sent if the server lacks them
 *   (ADR 0011). Answer bodies are sealed before they get here; nothing readable is stored.
 */
export type StoredSession = Session & { synced: 0 | 1 };
export type StoredEvent = Event & { synced: 0 | 1; syncedDay?: string };

export class WorkshopStore extends Dexie {
  settings!: Table<{ key: string; value: string }, string>;
  sessions!: Table<StoredSession, string>;
  events!: Table<StoredEvent, string>;

  constructor(slug: string) {
    super(`world-builder:${slug}`);
    this.version(1).stores({
      settings: 'key',
      sessions: 'id, sessionNo, synced',
      events: 'id, sessionId, synced, syncedDay',
    });
  }

  async get(key: string): Promise<string | undefined> {
    return (await this.settings.get(key))?.value;
  }
  async set(key: string, value: string): Promise<void> {
    await this.settings.put({ key, value });
  }

  async answeredCardIds(): Promise<Set<string>> {
    const rows = await this.events.where('id').notEqual('').toArray();
    return new Set(rows.filter((e) => e.kind === 'answered').map((e) => e.cardId));
  }

  async pending(): Promise<{ sessions: Session[]; events: Event[] }> {
    const sessions = await this.sessions.where('synced').equals(0).toArray();
    const events = await this.events.where('synced').equals(0).toArray();
    return { sessions: sessions.map(stripSession), events: events.map(stripEvent) };
  }

  async markSynced(sessionIds: string[], eventIds: string[], today: string): Promise<void> {
    await this.transaction('rw', this.sessions, this.events, async () => {
      for (const id of sessionIds) await this.sessions.update(id, { synced: 1 });
      for (const id of eventIds) await this.events.update(id, { synced: 1, syncedDay: today });
    });
  }

  /** The server lacks these ids (after a restore): queue them again. */
  async markUnsynced(eventIds: string[]): Promise<void> {
    for (const id of eventIds) await this.events.update(id, { synced: 0 });
  }

  /** Accepted events older than the retention window are no longer needed on the device. */
  async prune(today: string): Promise<number> {
    const cutoff = addDays(today, -EVENT_RETENTION_DAYS);
    const old = await this.events.where('syncedDay').below(cutoff).primaryKeys();
    await this.events.bulkDelete(old);
    return old.length;
  }

  async wipe(): Promise<void> {
    await this.delete();
  }
}

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** The participant's local calendar day, which is what the contract records. */
export function localDay(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const stripSession = ({
  id,
  sessionNo,
  startedDay,
  deckVersion,
  seed,
}: StoredSession): Session => ({ id, sessionNo, startedDay, deckVersion, seed });
const stripEvent = ({
  id,
  sessionId,
  cardId,
  seq,
  kind,
  body,
  createdDay,
  deckVersion,
}: StoredEvent): Event =>
  body === undefined
    ? { id, sessionId, cardId, seq, kind, createdDay, deckVersion }
    : { id, sessionId, cardId, seq, kind, body, createdDay, deckVersion };
