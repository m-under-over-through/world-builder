import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, parseRetryAfter, REQUEST_TIMEOUT_MS } from '../src/lib/api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the server's Retry-After", () => {
  it('is read as seconds, 1 to 60', () => {
    expect(parseRetryAfter('7')).toBe(7);
    expect(parseRetryAfter(' 42 ')).toBe(42);
    expect(parseRetryAfter('0')).toBe(1);
    expect(parseRetryAfter('600')).toBe(60);
  });

  it('is not read when missing or not a number of seconds', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
  });

  it('reaches the caller on a 429 and on nothing else', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).endsWith('/join')
          ? new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
              status: 429,
              headers: { 'retry-after': '9' },
            })
          : new Response(JSON.stringify({ error: 'JOIN_WAVE_FULL' }), {
              status: 403,
              headers: { 'retry-after': '9' },
            }),
      ),
    );
    const limited = await api('/rural-manufacturing/join', { body: {} });
    expect(limited).toEqual({ ok: false, error: 'RATE_LIMITED', status: 429, retryAfter: 9 });
    const full = await api('/rural-manufacturing/waves/wave-1/opened', { body: {} });
    expect(full).toEqual({ ok: false, error: 'JOIN_WAVE_FULL', status: 403 });
  });
});

/** An abort as the browser reports it, when the signal stops a request. */
const aborted = () => new DOMException('The operation was aborted.', 'AbortError');

/** A promise that never settles on its own, and rejects as a browser does when the signal aborts. */
function untilAborted<T>(signal: AbortSignal | null | undefined): Promise<T> {
  return new Promise<T>((_, reject) => signal?.addEventListener('abort', () => reject(aborted())));
}

describe('a request has a time limit (ADR 0028)', () => {
  // Only the timers api() uses are held; anything else (the device store) runs as it does.
  const holdTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

  it('a request with no answer within the limit resolves as CLIENT_SYNC_FAILED with status 0, and the fetch was aborted', async () => {
    holdTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: string, init: RequestInit = {}) => {
        signal = init.signal ?? undefined;
        return untilAborted<Response>(signal);
      }),
    );
    const result = api('/rural-manufacturing/me', { code: '1234567890123456' });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal!.aborted).toBe(true);
    expect(await result).toEqual({ ok: false, error: 'CLIENT_SYNC_FAILED', status: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an answer in time is returned as before, and no timer is left running', async () => {
    holdTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ hello: 'world' }), { status: 200 })),
    );
    expect(await api('/rural-manufacturing/me')).toEqual({ ok: true, data: { hello: 'world' } });
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ error: 'WORKSHOP_CLOSED' }), { status: 403 }),
      ),
    );
    expect(await api('/rural-manufacturing/me')).toEqual({
      ok: false,
      error: 'WORKSHOP_CLOSED',
      status: 403,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a body that is not JSON still reads as no body, as before', async () => {
    holdTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 502 })),
    );
    expect(await api('/rural-manufacturing/me')).toEqual({
      ok: false,
      error: 'CLIENT_SYNC_FAILED',
      status: 502,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a body that takes longer than the limit to read is also stopped', async () => {
    holdTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string, init: RequestInit = {}) => {
        signal = init.signal ?? undefined;
        // The answer's head has come, 200, and its body never finishes.
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => untilAborted<unknown>(signal),
        } as unknown as Response;
      }),
    );
    const result = api('/rural-manufacturing/me');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(signal!.aborted).toBe(true);
    expect(await result).toEqual({ ok: false, error: 'CLIENT_SYNC_FAILED', status: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a caller may give a limit of its own', async () => {
    holdTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: string, init: RequestInit = {}) => {
        signal = init.signal ?? undefined;
        return untilAborted<Response>(signal);
      }),
    );
    const result = api('/rural-manufacturing/sync', { body: {}, timeoutMs: 40_000 });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(40_000 - REQUEST_TIMEOUT_MS);
    expect(signal!.aborted).toBe(true);
    expect(await result).toEqual({ ok: false, error: 'CLIENT_SYNC_FAILED', status: 0 });
  });
});
