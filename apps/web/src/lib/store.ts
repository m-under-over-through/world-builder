import Dexie, { type Table } from 'dexie';
import { EVENT_RETENTION_DAYS, type Event, type Session } from '@wb/contracts';

/**
 * Storage on the device, one database per workshop (namespaced by slug, ADR 0004).
 * - settings: the code, the wave or invite the person arrived with, consent.
 * - sessions and events: what has been done. `synced` is 0 until the server accepted the row.
 *   Accepted rows are kept for EVENT_RETENTION_DAYS and re-sent if the server lacks them
 *   (ADR 0011). Answer bodies are sealed before they get here: an event never carries plain text.
 * - answers: the readable copy of each answer written on this device, for the participant alone
 *   (ADR 0014), keyed by session and card. "Your world so far" reads it. It is never part of
 *   `history()` or `pending()`, so it cannot enter a sync request; "delete me" wipes it with
 *   the rest.
 *
 * `Store` is what the rest of the client uses; `WorkshopStore` keeps it in IndexedDB, and
 * `MemoryStore` keeps it for one open when the browser refuses storage
 * (CLIENT_STORAGE_UNAVAILABLE): the app still runs one session, and the code is shown at the end
 * so it can be written down.
 */
export type StoredSession = Session & { synced: 0 | 1 };
export type StoredEvent = Event & { synced: 0 | 1; syncedDay?: string };
/** The readable copy of one answer, on the device that wrote it (ADR 0014). */
export interface ReadableAnswer {
  /** `${sessionId}:${cardId}` (answerKey), so a card answered in two sessions keeps both. */
  key: string;
  sessionId: string;
  cardId: string;
  text: string;
}

export function answerKey(sessionId: string, cardId: string): string {
  return `${sessionId}:${cardId}`;
}

export interface Store {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  unset(key: string): Promise<void>;
  putSession(session: StoredSession): Promise<void>;
  putEvent(event: StoredEvent): Promise<void>;
  /** Everything the device holds about what was done, synced or not, as the contract's rows. */
  history(): Promise<{ sessions: Session[]; events: Event[] }>;
  /** What waits for the server. */
  pending(): Promise<{ sessions: Session[]; events: Event[] }>;
  /** The ids the server once accepted, for the comparison with GET /me after a restore. */
  accepted(): Promise<{ sessionIds: string[]; eventIds: string[] }>;
  markSynced(sessionIds: string[], eventIds: string[], today: string): Promise<void>;
  /** The server lacks these rows (after a restore): queue them again. */
  markUnsynced(sessionIds: string[], eventIds: string[]): Promise<void>;
  /** Accepted events older than the retention window are no longer needed on the device. */
  prune(today: string): Promise<number>;
  /** Keep the readable copy of an answer this device wrote (ADR 0014). */
  putAnswer(answer: ReadableAnswer): Promise<void>;
  /** Every readable copy on this device. */
  answers(): Promise<ReadableAnswer[]>;
  wipe(): Promise<void>;
}

export class WorkshopStore extends Dexie implements Store {
  settings!: Table<{ key: string; value: string }, string>;
  sessions!: Table<StoredSession, string>;
  events!: Table<StoredEvent, string>;
  /** The readable copies, in a table of their own (the method `answers` reads it). */
  copies!: Table<ReadableAnswer, string>;

  constructor(slug: string) {
    super(`world-builder:${slug}`);
    this.version(1).stores({
      settings: 'key',
      sessions: 'id, sessionNo, synced',
      events: 'id, sessionId, synced, syncedDay',
    });
    // Version 2 adds the readable copies (ADR 0014). A database from version 1 gains the table
    // on open; nothing else changes.
    this.version(2).stores({
      settings: 'key',
      sessions: 'id, sessionNo, synced',
      events: 'id, sessionId, synced, syncedDay',
      copies: 'key, sessionId',
    });
  }

  async get(key: string): Promise<string | undefined> {
    return (await this.settings.get(key))?.value;
  }
  async set(key: string, value: string): Promise<void> {
    await this.settings.put({ key, value });
  }
  async unset(key: string): Promise<void> {
    await this.settings.delete(key);
  }
  async putSession(session: StoredSession): Promise<void> {
    await this.sessions.put(session);
  }
  async putEvent(event: StoredEvent): Promise<void> {
    await this.events.put(event);
  }

  async history(): Promise<{ sessions: Session[]; events: Event[] }> {
    const sessions = await this.sessions.toArray();
    const events = await this.events.toArray();
    return { sessions: sessions.map(stripSession), events: events.map(stripEvent) };
  }

  async pending(): Promise<{ sessions: Session[]; events: Event[] }> {
    const sessions = await this.sessions.where('synced').equals(0).toArray();
    const events = await this.events.where('synced').equals(0).toArray();
    return { sessions: sessions.map(stripSession), events: events.map(stripEvent) };
  }

  async accepted(): Promise<{ sessionIds: string[]; eventIds: string[] }> {
    return {
      sessionIds: (await this.sessions.where('synced').equals(1).primaryKeys()) as string[],
      eventIds: (await this.events.where('synced').equals(1).primaryKeys()) as string[],
    };
  }

  async markSynced(sessionIds: string[], eventIds: string[], today: string): Promise<void> {
    await this.transaction('rw', this.sessions, this.events, async () => {
      for (const id of sessionIds) await this.sessions.update(id, { synced: 1 });
      for (const id of eventIds) await this.events.update(id, { synced: 1, syncedDay: today });
    });
  }

  async markUnsynced(sessionIds: string[], eventIds: string[]): Promise<void> {
    await this.transaction('rw', this.sessions, this.events, async () => {
      for (const id of sessionIds) await this.sessions.update(id, { synced: 0 });
      for (const id of eventIds) await this.events.update(id, { synced: 0 });
    });
  }

  /**
   * Only accepted events are pruned: a re-queued event keeps the day it was first accepted, and
   * it must wait in the outbox however old that day is.
   */
  async prune(today: string): Promise<number> {
    const cutoff = addDays(today, -EVENT_RETENTION_DAYS);
    const old = await this.events
      .where('syncedDay')
      .below(cutoff)
      .filter((e) => e.synced === 1)
      .primaryKeys();
    await this.events.bulkDelete(old);
    return old.length;
  }

  async putAnswer(answer: ReadableAnswer): Promise<void> {
    await this.copies.put(answer);
  }
  async answers(): Promise<ReadableAnswer[]> {
    return this.copies.toArray();
  }

  /** The whole database, the readable copies included, is deleted. */
  async wipe(): Promise<void> {
    await this.delete();
  }
}

/** The same store for one open, in memory, for a browser that refuses storage. */
export class MemoryStore implements Store {
  private settings = new Map<string, string>();
  private sessions = new Map<string, StoredSession>();
  private events = new Map<string, StoredEvent>();
  private copies = new Map<string, ReadableAnswer>();

  async get(key: string): Promise<string | undefined> {
    return this.settings.get(key);
  }
  async set(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }
  async unset(key: string): Promise<void> {
    this.settings.delete(key);
  }
  async putSession(session: StoredSession): Promise<void> {
    this.sessions.set(session.id, session);
  }
  async putEvent(event: StoredEvent): Promise<void> {
    this.events.set(event.id, event);
  }
  async history(): Promise<{ sessions: Session[]; events: Event[] }> {
    return {
      sessions: [...this.sessions.values()].map(stripSession),
      events: [...this.events.values()].map(stripEvent),
    };
  }
  async pending(): Promise<{ sessions: Session[]; events: Event[] }> {
    return {
      sessions: [...this.sessions.values()].filter((s) => s.synced === 0).map(stripSession),
      events: [...this.events.values()].filter((e) => e.synced === 0).map(stripEvent),
    };
  }
  async accepted(): Promise<{ sessionIds: string[]; eventIds: string[] }> {
    return {
      sessionIds: [...this.sessions.values()].filter((s) => s.synced === 1).map((s) => s.id),
      eventIds: [...this.events.values()].filter((e) => e.synced === 1).map((e) => e.id),
    };
  }
  async markSynced(sessionIds: string[], eventIds: string[], today: string): Promise<void> {
    for (const id of sessionIds) {
      const s = this.sessions.get(id);
      if (s) s.synced = 1;
    }
    for (const id of eventIds) {
      const e = this.events.get(id);
      if (e) Object.assign(e, { synced: 1, syncedDay: today });
    }
  }
  async markUnsynced(sessionIds: string[], eventIds: string[]): Promise<void> {
    for (const id of sessionIds) {
      const s = this.sessions.get(id);
      if (s) s.synced = 0;
    }
    for (const id of eventIds) {
      const e = this.events.get(id);
      if (e) e.synced = 0;
    }
  }
  async prune(today: string): Promise<number> {
    const cutoff = addDays(today, -EVENT_RETENTION_DAYS);
    let n = 0;
    for (const [id, e] of this.events) {
      if (e.synced === 1 && e.syncedDay !== undefined && e.syncedDay < cutoff) {
        this.events.delete(id);
        n++;
      }
    }
    return n;
  }
  async putAnswer(answer: ReadableAnswer): Promise<void> {
    this.copies.set(answer.key, answer);
  }
  async answers(): Promise<ReadableAnswer[]> {
    return [...this.copies.values()];
  }
  async wipe(): Promise<void> {
    this.settings.clear();
    this.sessions.clear();
    this.events.clear();
    this.copies.clear();
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
