import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkshopStore } from '../src/lib/store.ts';
import { pendingJoin, queueJoin, syncNow } from '../src/lib/sync.ts';

/** The API as a stub: each call answers what the test says, and the calls are recorded in order. */
function stubApi(answers: ((path: string) => { status: number; body: unknown } | 'offline')[]) {
  const calls: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const path = String(input);
      calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const answer = (answers.shift() ?? (() => ({ status: 200, body: {} })))(path);
      if (answer === 'offline') throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    }),
  );
  return calls;
}

const CODE = '1234567890123456';
const event = {
  id: '10000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000001',
  cardId: 'cool',
  seq: 0,
  kind: 'dismissed' as const,
  createdDay: '2026-11-16',
  deckVersion: '0.1',
  synced: 0 as const,
};

afterEach(() => vi.unstubAllGlobals());

describe('a join made offline is sent before the first sync', () => {
  it('posts the queued join first, then the outbox, and forgets the join once accepted', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await queueJoin(store, { code: CODE, wave: 'wave-1' });
    await store.events.put(event);
    const calls = stubApi([
      () => ({ status: 200, body: { ok: true } }),
      () => ({ status: 200, body: { acceptedSessionIds: [], acceptedEventIds: [event.id] } }),
    ]);
    const status = await syncNow(store, 'rural-manufacturing', CODE);
    expect(calls.map((c) => c.path)).toEqual([
      '/api/rural-manufacturing/join',
      '/api/rural-manufacturing/sync',
    ]);
    expect(calls[0]!.body).toEqual({ code: CODE, wave: 'wave-1' });
    expect(status).toEqual({ lastResult: 'ok', outboxSize: 0 });
    expect(await pendingJoin(store)).toBeNull();
  });

  it('sends nothing else while the join cannot go out, and keeps the join for next time', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await queueJoin(store, { code: CODE, wave: 'wave-1' });
    await store.events.put(event);
    const calls = stubApi([() => 'offline']);
    const status = await syncNow(store, 'rural-manufacturing', CODE);
    expect(calls).toHaveLength(1);
    expect(status.lastResult).toBe('offline');
    expect(status.outboxSize).toBe(1);
    expect(await pendingJoin(store)).toEqual({ code: CODE, wave: 'wave-1' });
  });

  it('reports a refused join as the sync error and keeps the outbox', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await queueJoin(store, { code: CODE, invite: 'abcDEF123_-abcDEF123_-' });
    await store.events.put(event);
    stubApi([() => ({ status: 403, body: { error: 'JOIN_INVITE_USED' } })]);
    const status = await syncNow(store, 'rural-manufacturing', CODE);
    expect(status).toEqual({ lastResult: 'error', lastError: 'JOIN_INVITE_USED', outboxSize: 1 });
  });

  it('reads a damaged queued join as none', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await store.set('pendingJoin', '{"code":"short"}');
    expect(await pendingJoin(store)).toBeNull();
  });
});
