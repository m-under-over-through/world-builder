import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateCode, MAX_REQUEST_BYTES } from '@wb/contracts';
import { API_ONLY_HEADERS, SECURITY_HEADERS } from '../src/headers.ts';
import { auth, freshApp, joined, json, slug } from './helpers.ts';

/**
 * Netlify applies apps/web/public/_headers to static files, never to a function's response, so
 * the API sets the same headers itself (src/headers.ts). The security pass of 11 November 2026
 * found /api/health on staging without seven of them. These tests hold every kind of API answer
 * to the `/*` block of the file, word for word, so the two can never drift apart.
 */

/** The `/*` block of _headers as name to value, names lowercased. */
function pageHeaders(): Map<string, string> {
  const file = readFileSync(new URL('../../web/public/_headers', import.meta.url), 'utf8');
  const out = new Map<string, string>();
  let inAll = false;
  for (const raw of file.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inAll = line === '/*';
      continue;
    }
    const m = line.trim().match(/^([A-Za-z-]+):\s*(.*)$/);
    if (inAll && m) out.set(m[1]!.toLowerCase(), m[2]!);
  }
  return out;
}

function expectSecurityHeaders(res: Response, what: string) {
  const want = pageHeaders();
  expect(want.size, 'the /* block of _headers').toBeGreaterThanOrEqual(9);
  for (const [name, value] of want) expect(res.headers.get(name), `${what}: ${name}`).toBe(value);
  expect(res.headers.get('cache-control'), `${what}: cache-control`).toBe('no-store');
}

describe('security headers on API responses', () => {
  it('are the /* block of _headers, word for word, plus no-store, and nothing of it is missing', () => {
    const want = pageHeaders();
    const ours = new Map(
      Object.entries(SECURITY_HEADERS).map(([name, value]) => [name.toLowerCase(), value]),
    );
    expect(ours).toEqual(want);
    expect(API_ONLY_HEADERS).toEqual({ 'Cache-Control': 'no-store' });
  });

  it('reach every kind of answer: health, a join, a refusal, a 401, a 404, a 413, a 429 and a server error', async () => {
    const t = await freshApp();
    expectSecurityHeaders(await t.app.request('/api/health'), 'health');

    const code = generateCode();
    expectSecurityHeaders(
      await t.app.request(`/api/${slug}/join`, json({ code, wave: 'wave-1' })),
      'join',
    );
    expectSecurityHeaders(await t.app.request(`/api/${slug}/me`, { headers: auth(code) }), 'me');
    expectSecurityHeaders(
      await t.app.request(`/api/${slug}/join`, json({ code: 'x' })),
      'REQUEST_INVALID',
    );
    expectSecurityHeaders(await t.app.request(`/api/${slug}/me`), 'AUTH_CODE_MISSING');
    expectSecurityHeaders(await t.app.request('/api/nobody-here/me'), 'WORKSHOP_UNKNOWN');
    expectSecurityHeaders(await t.app.request('/elsewhere'), 'notFound');
    expectSecurityHeaders(
      await t.app.request(`/api/${slug}/join`, json({ pad: 'x'.repeat(MAX_REQUEST_BYTES) })),
      'REQUEST_TOO_LARGE',
    );

    let limited: Response | undefined;
    for (let i = 0; i < 61 && !limited; i++) {
      const res = await t.app.request('/api/health');
      if (res.status === 429) limited = res;
    }
    expect(limited?.status).toBe(429);
    expectSecurityHeaders(limited!, 'RATE_LIMITED');
    expect(limited!.headers.get('retry-after')).toMatch(/^\d+$/);

    const other = await joined(t.app);
    await t.db.execute('drop table rate_buckets');
    const failed = await t.app.request(`/api/${slug}/me`, { headers: auth(other) });
    expect(failed.status).toBe(500);
    expectSecurityHeaders(failed, 'SERVER_ERROR');
  });
});
