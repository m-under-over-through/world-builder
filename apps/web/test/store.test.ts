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

  it('re-queues events and sessions the server lacks', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await store.events.bulkPut([event(1, 1, '2026-11-16')]);
    await store.sessions.put({
      id: '00000000-0000-4000-8000-000000000001',
      sessionNo: 1,
      startedDay: '2026-11-16',
      deckVersion: '0.1',
      seed: '0123456789abcdef',
      synced: 1,
    });
    expect(await store.accepted()).toEqual({
      sessionIds: ['00000000-0000-4000-8000-000000000001'],
      eventIds: [event(1, 1).id],
    });
    await store.markUnsynced(['00000000-0000-4000-8000-000000000001'], [event(1, 1).id]);
    const pending = await store.pending();
    expect(pending.events).toHaveLength(1);
    expect(pending.sessions).toHaveLength(1);
  });

  it('never prunes a re-queued event, however old the day it was first accepted', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    const today = '2026-12-01';
    await store.events.bulkPut([
      event(1, 1, addDays(today, -20)),
      event(2, 1, addDays(today, -20)),
    ]);
    await store.markUnsynced([], [event(1, 1).id]);
    expect(await store.prune(today)).toBe(1);
    expect((await store.events.toArray()).map((e) => e.id)).toEqual([event(1, 1).id]);
  });

  it('the memory store behaves the same for one open', async () => {
    const { MemoryStore } = await import('../src/lib/store.ts');
    const store = new MemoryStore();
    await store.set('code', '1234567890123456');
    expect(await store.get('code')).toBe('1234567890123456');
    await store.putEvent(event(1, 0));
    expect((await store.pending()).events).toHaveLength(1);
    await store.markSynced([], [event(1, 0).id], '2026-11-01');
    expect((await store.pending()).events).toHaveLength(0);
    expect((await store.accepted()).eventIds).toEqual([event(1, 0).id]);
    expect(await store.prune('2026-12-01')).toBe(1);
    await store.wipe();
    expect(await store.get('code')).toBeUndefined();
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
