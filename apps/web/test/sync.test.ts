import { afterEach, describe, expect, it, vi } from 'vitest';
import { REQUEST_TIMEOUT_MS, SYNC_TIMEOUT_MS } from '../src/lib/api.ts';
import { WorkshopStore } from '../src/lib/store.ts';
import {
  pendingJoin,
  queueJoin,
  refusedForGood,
  syncNow,
  syncOnOpen,
  type SyncStatus,
} from '../src/lib/sync.ts';

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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
    expect(status).toEqual({ lastResult: 'ok', outboxSize: 0, outboxSessions: 0 });
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
    expect(status).toEqual({
      lastResult: 'error',
      lastError: 'JOIN_INVITE_USED',
      outboxSize: 1,
      outboxSessions: 0,
      httpStatus: 403,
    });
    expect(refusedForGood(status)).toBe(true);
  });

  it('a queued join answered JOIN_CODE_TAKEN is done: the server knows the code, so the join is forgotten and the outbox goes out', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await queueJoin(store, { code: CODE, wave: 'wave-1' });
    await store.events.put(event);
    const calls = stubApi([
      () => ({ status: 409, body: { error: 'JOIN_CODE_TAKEN' } }),
      () => ({ status: 200, body: { acceptedSessionIds: [], acceptedEventIds: [event.id] } }),
    ]);
    const status = await syncNow(store, 'rural-manufacturing', CODE);
    expect(calls.map((c) => c.path)).toEqual([
      '/api/rural-manufacturing/join',
      '/api/rural-manufacturing/sync',
    ]);
    expect(status).toEqual({ lastResult: 'ok', outboxSize: 0, outboxSessions: 0 });
    expect(await pendingJoin(store)).toBeNull();
  });

  it('reads a damaged queued join as none and forgets it, so it is not read again on every open', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await store.set('pendingJoin', '{"code":"short"}');
    expect(await pendingJoin(store)).toBeNull();
    expect(await store.get('pendingJoin')).toBeUndefined();
  });
});

describe('the sync on open', () => {
  const ME = {
    workshop: {
      slug: 'rural-manufacturing',
      name: 'x',
      closesDay: '2026-12-06',
      deleteDay: '2027-02-05',
    },
    participant: { createdDay: '2026-11-16', invitesLeft: 3, wave: 'wave-1', sessionsCount: 0 },
    sessions: [],
    events: [],
  };

  it('sends the queued join before GET /me, so the first online open after an offline consent is not refused', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await queueJoin(store, { code: CODE, wave: 'wave-1' });
    await store.events.put(event);
    const calls = stubApi([
      () => ({ status: 200, body: { ok: true } }),
      () => ({ status: 200, body: ME }),
      () => ({ status: 200, body: { acceptedSessionIds: [], acceptedEventIds: [event.id] } }),
    ]);
    const { me, sync } = await syncOnOpen(store, 'rural-manufacturing', CODE);
    expect(calls.map((c) => c.path.replace('/api/rural-manufacturing', ''))).toEqual([
      '/join',
      '/me',
      '/sync',
    ]);
    expect(me?.participant.wave).toBe('wave-1');
    expect(sync).toEqual({ lastResult: 'ok', outboxSize: 0, outboxSessions: 0 });
  });

  it('asks nothing else while the join cannot go out', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await queueJoin(store, { code: CODE, wave: 'wave-1' });
    await store.events.put(event);
    const calls = stubApi([() => 'offline']);
    const { me, sync } = await syncOnOpen(store, 'rural-manufacturing', CODE);
    expect(calls).toHaveLength(1);
    expect(me).toBeNull();
    expect(sync).toEqual({
      lastResult: 'offline',
      lastError: 'CLIENT_SYNC_FAILED',
      outboxSize: 1,
      outboxSessions: 0,
    });
  });

  it("an answer to GET /me that is not the contract's shape re-queues nothing", async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await store.events.put({ ...event, synced: 1, syncedDay: '2026-11-16' });
    stubApi([
      () => ({ status: 200, body: { unexpected: true } }),
      () => ({ status: 200, body: { acceptedSessionIds: [], acceptedEventIds: [] } }),
    ]);
    const { me } = await syncOnOpen(store, 'rural-manufacturing', CODE);
    expect(me).toBeNull();
    expect((await store.pending()).events).toHaveLength(0);
  });

  it('an answer to GET /me handed in by the caller is used, and the server is not asked again', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await store.events.put(event);
    const calls = stubApi([
      () => ({ status: 200, body: { acceptedSessionIds: [], acceptedEventIds: [event.id] } }),
    ]);
    const { me } = await syncOnOpen(store, 'rural-manufacturing', CODE, { ok: true, data: ME });
    expect(me?.participant.wave).toBe('wave-1');
    expect(calls.map((c) => c.path.replace('/api/rural-manufacturing', ''))).toEqual(['/sync']);
  });

  it('a session the server lacks after a restore is queued again with its events', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await store.sessions.put({
      id: event.sessionId,
      sessionNo: 1,
      startedDay: '2026-11-16',
      deckVersion: '0.1',
      seed: '0123456789abcdef',
      synced: 1,
    });
    await store.events.put({ ...event, synced: 1, syncedDay: '2026-11-16' });
    const calls = stubApi([
      () => ({ status: 200, body: ME }),
      () => ({
        status: 200,
        body: { acceptedSessionIds: [event.sessionId], acceptedEventIds: [event.id] },
      }),
    ]);
    const { sync } = await syncOnOpen(store, 'rural-manufacturing', CODE);
    expect(sync.lastResult).toBe('ok');
    const sent = calls[1]!.body as { sessions: unknown[]; events: unknown[] };
    expect(sent.sessions).toHaveLength(1);
    expect(sent.events).toHaveLength(1);
  });

  it('with no join waiting: GET /me, then the outbox', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await store.events.put(event);
    const calls = stubApi([
      () => ({ status: 200, body: ME }),
      () => ({ status: 200, body: { acceptedSessionIds: [], acceptedEventIds: [event.id] } }),
    ]);
    await syncOnOpen(store, 'rural-manufacturing', CODE);
    expect(calls.map((c) => c.path.replace('/api/rural-manufacturing', ''))).toEqual([
      '/me',
      '/sync',
    ]);
  });
});

describe('a refusal that sending again cannot change', () => {
  const failedWith = (httpStatus: number | undefined, lastError: string): SyncStatus => ({
    lastResult: httpStatus === undefined ? 'offline' : 'error',
    lastError,
    outboxSize: 1,
    outboxSessions: 0,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  });

  it('is a 4xx other than WORKSHOP_CLOSED, AUTH_CODE_UNKNOWN and RATE_LIMITED, contract code or not', () => {
    for (const [status, code] of [
      [400, 'SYNC_PAYLOAD_INVALID'],
      [413, 'SYNC_BATCH_TOO_LARGE'],
      [413, 'REQUEST_TOO_LARGE'],
      [403, 'JOIN_WAVE_FULL'],
      [404, 'JOIN_WAVE_UNKNOWN'],
      [404, 'WORKSHOP_UNKNOWN'],
      [401, 'AUTH_CODE_MISSING'],
      [404, 'CLIENT_SYNC_FAILED'], // a 404 without a contract body: a proxy's page
    ] as const)
      expect(refusedForGood(failedWith(status, code)), code).toBe(true);
  });

  it('is never a refusal with a way out, a 5xx, a 408 or 429, or no answer at all', () => {
    for (const [status, code] of [
      [403, 'WORKSHOP_CLOSED'],
      [401, 'AUTH_CODE_UNKNOWN'],
      [429, 'RATE_LIMITED'],
      [429, 'CLIENT_SYNC_FAILED'],
      [408, 'CLIENT_SYNC_FAILED'],
      [500, 'SERVER_ERROR'],
      [503, 'SERVER_NOT_CONFIGURED'],
      [undefined, 'CLIENT_SYNC_FAILED'],
    ] as const)
      expect(refusedForGood(failedWith(status, code)), `${status} ${code}`).toBe(false);
    expect(refusedForGood({ lastResult: 'ok', outboxSize: 0, outboxSessions: 0 })).toBe(false);
  });
});

describe('the time limits of the sync (ADR 0028)', () => {
  /**
   * A fetch that never answers, and is stopped as a browser stops it when its signal aborts. Each
   * request's signal is kept by path, and `started` resolves when a path is first asked for.
   */
  function stubSilentApi() {
    const signals = new Map<string, AbortSignal>();
    const waiting = new Map<string, () => void>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init: RequestInit = {}) => {
        const path = String(input);
        signals.set(path, init.signal!);
        waiting.get(path)?.();
        return new Promise<Response>((_, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          ),
        );
      }),
    );
    const started = (path: string) =>
      signals.has(path)
        ? Promise.resolve()
        : new Promise<void>((resolve) => waiting.set(path, resolve));
    return { signals, started };
  }

  it('the sync request passes the longer limit: it is not stopped at fifteen seconds, it is at sixty, and the outbox waits', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await store.events.put(event);
    const api = stubSilentApi();
    // Only the timers api() uses are held; the device store keeps running on its own.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const status = syncNow(store, 'rural-manufacturing', CODE);
    await api.started('/api/rural-manufacturing/sync');
    const signal = api.signals.get('/api/rural-manufacturing/sync')!;
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS - REQUEST_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    expect(await status).toEqual({
      lastResult: 'offline',
      lastError: 'CLIENT_SYNC_FAILED',
      outboxSize: 1,
      outboxSessions: 0,
    });
  });

  it('a queued join that gets no answer is stopped at fifteen seconds, and nothing else is sent', async () => {
    const store = new WorkshopStore(`t-${Math.random()}`);
    await queueJoin(store, { code: CODE, wave: 'wave-1' });
    await store.events.put(event);
    const api = stubSilentApi();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const status = syncNow(store, 'rural-manufacturing', CODE);
    await api.started('/api/rural-manufacturing/join');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(api.signals.get('/api/rural-manufacturing/join')!.aborted).toBe(true);
    expect((await status).lastResult).toBe('offline');
    expect([...api.signals.keys()]).toEqual(['/api/rural-manufacturing/join']);
    expect(await pendingJoin(store)).toEqual({ code: CODE, wave: 'wave-1' });
  });
});
