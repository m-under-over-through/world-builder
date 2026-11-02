import { describe, expect, it } from 'vitest';
import { errorResponseSchema, generateCode } from '@wb/contracts';
import { auth, freshApp, joined, json, seedWorkshop, slug, type TestApp } from './helpers.ts';

/**
 * Rate limiting without addresses (ADR 0012): per code on authenticated routes, per workshop on
 * the rest, a global budget on health. Each test runs on its own database: the clock is fixed, so
 * a bucket that fills in one test would stay full for the others.
 */

/** Sends the request until the first 429; returns that response and how many were sent. */
async function untilLimited(
  t: TestApp,
  request: () => Response | Promise<Response>,
  limit: number,
) {
  for (let sent = 1; sent <= limit + 1; sent++) {
    const res = await request();
    if (res.status === 429) return { res, sent };
    expect(res.status, `request ${sent} of ${limit}`).toBeLessThan(429);
  }
  throw new Error(`never limited within ${limit + 1} requests`);
}

async function expectRateLimited(res: Response) {
  expect(res.status).toBe(429);
  const body = errorResponseSchema.parse(await res.json());
  expect(body.error).toBe('RATE_LIMITED');
  expect(body.errorId).toBeUndefined();
}

describe('rate limits without addresses', () => {
  it('health is budgeted at 60 a minute for everyone; the 61st call is RATE_LIMITED with the contract body', async () => {
    const t = await freshApp();
    const { res, sent } = await untilLimited(t, () => t.app.request('/api/health'), 60);
    expect(sent).toBe(61);
    await expectRateLimited(res);
    t.clock.advanceMinutes(1);
    expect((await t.app.request('/api/health')).status).toBe(200);
  });

  it('wave opens are budgeted per workshop at 120 a minute', async () => {
    const t = await freshApp();
    const { res, sent } = await untilLimited(
      t,
      () => t.app.request(`/api/${slug}/waves/wave-1/opened`, { method: 'POST' }),
      120,
    );
    expect(sent).toBe(121);
    await expectRateLimited(res);
  });

  it('joins are budgeted per workshop at 30 a minute, and another workshop keeps its own budget', async () => {
    const t = await freshApp();
    await seedWorkshop(t.db, { slug: 'other-one' });
    const { res, sent } = await untilLimited(
      t,
      () => t.app.request(`/api/${slug}/join`, json({ code: generateCode(), wave: 'wave-1' })),
      30,
    );
    expect(sent).toBe(31);
    await expectRateLimited(res);
    expect((await joined(t.app, 'other-one')).length).toBe(16);
  });

  it('unknown codes are budgeted per workshop at 30 a minute, so guessing is slow', async () => {
    const t = await freshApp();
    const { res, sent } = await untilLimited(
      t,
      () => t.app.request(`/api/${slug}/me`, { headers: auth(generateCode()) }),
      30,
    );
    expect(sent).toBe(31);
    await expectRateLimited(res);
    // A real participant is not affected: the unknown-code bucket is not theirs.
    const code = await joined(t.app);
    expect((await t.app.request(`/api/${slug}/me`, { headers: auth(code) })).status).toBe(200);
  });

  it('an authenticated code is budgeted at 60 a minute on its own, and another code is not affected', async () => {
    const t = await freshApp();
    const a = await joined(t.app);
    const b = await joined(t.app);
    const { res, sent } = await untilLimited(
      t,
      () => t.app.request(`/api/${slug}/me`, { headers: auth(a) }),
      60,
    );
    expect(sent).toBe(61);
    await expectRateLimited(res);
    expect((await t.app.request(`/api/${slug}/me`, { headers: auth(b) })).status).toBe(200);
    t.clock.advanceMinutes(1);
    expect((await t.app.request(`/api/${slug}/me`, { headers: auth(a) })).status).toBe(200);
  });
});
