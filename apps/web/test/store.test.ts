import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addDays, WorkshopStore } from '../src/lib/store.ts';

const event = (n: number, synced: 0 | 1, syncedDay?: string) => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  sessionId: '00000000-0000-4000-8000-000000000001',
  cardId: 'cool',
  seq: n,
  kind: 'answered' as const,
  body: 'v1.' + 'A'.repeat(64),
  createdDay: '2026-11-16',
  deckVersion: '0.1',
  synced,
  ...(syncedDay ? { syncedDay } : {}),
});

describe('the device store', () => {
  it('reports only unsynced rows as pending and strips the local fields from them', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await store.events.bulkPut([event(1, 0), event(2, 1, '2026-11-16')]);
    const pending = await store.pending();
    expect(pending.events.map((e) => e.id)).toEqual([event(1, 0).id]);
    expect(pending.events[0]).not.toHaveProperty('synced');
  });

  it('keeps accepted events for the retention window and prunes older ones', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    const today = '2026-12-01';
    await store.events.bulkPut([
      event(1, 1, addDays(today, -13)),
      event(2, 1, addDays(today, -15)),
      event(3, 0),
    ]);
    expect(await store.prune(today)).toBe(1);
    expect((await store.events.toArray()).map((e) => e.id).sort()).toEqual(
      [event(1, 1).id, event(3, 0).id].sort(),
    );
  });

  it('re-queues events the server lacks', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await store.events.bulkPut([event(1, 1, '2026-11-16')]);
    await store.markUnsynced([event(1, 1).id]);
    expect((await store.pending()).events).toHaveLength(1);
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
