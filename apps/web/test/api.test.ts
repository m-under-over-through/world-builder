import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, parseRetryAfter } from '../src/lib/api.ts';

afterEach(() => vi.unstubAllGlobals());

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
