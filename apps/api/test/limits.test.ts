import { describe, expect, it } from 'vitest';
import { errorResponseSchema, generateCode } from '@wb/contracts';
import { countRateBuckets } from '@wb/db';
import { PRUNE_EVERY_CHECKS } from '../src/app.ts';
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
  const wait = Number(res.headers.get('retry-after'));
  expect(Number.isInteger(wait) && wait >= 1 && wait <= 60, 'Retry-After in seconds').toBe(true);
}

describe('rate limits without addresses', () => {
  it('health is budgeted at 60 a minute for everyone; the 61st call is RATE_LIMITED with the contract body', async () => {
    const t = await freshApp();
    const { res, sent } = await untilLimited(t, () => t.app.request('/api/health'), 60);
    expect(sent).toBe(61);
    await expectRateLimited(res);
    expect(res.headers.get('retry-after')).toBe('60'); // the clock is on the minute
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

  it('joins are budgeted per workshop at 120 a minute, and another workshop keeps its own budget', async () => {
    const t = await freshApp();
    await seedWorkshop(t.db, { slug: 'other-one' });
    const { res, sent } = await untilLimited(
      t,
      () => t.app.request(`/api/${slug}/join`, json({ code: generateCode(), wave: 'wave-1' })),
      120,
    );
    expect(sent).toBe(121);
    await expectRateLimited(res);
    expect((await joined(t.app, 'other-one')).length).toBe(16);
  });

  it('a newsletter minute: 120 readers join, the 121st is told to wait the rest of the minute and then joins', async () => {
    const t = await freshApp();
    t.clock.advanceSeconds(45); // the newsletter landed at 12:00:45
    for (let i = 0; i < 120; i++) {
      expect(
        (await t.app.request(`/api/${slug}/join`, json({ code: generateCode(), wave: 'wave-1' })))
          .status,
      ).toBe(200);
    }
    const code = generateCode();
    const refused = await t.app.request(`/api/${slug}/join`, json({ code, wave: 'wave-1' }));
    await expectRateLimited(refused);
    expect(refused.headers.get('retry-after')).toBe('15');
    // The client waits that long and retries once.
    t.clock.advanceSeconds(15);
    const retried = await t.app.request(`/api/${slug}/join`, json({ code, wave: 'wave-1' }));
    expect(retried.status).toBe(200);
  });

  it('a refused join that was the same code over and over still cost one participant row', async () => {
    const t = await freshApp();
    const code = generateCode();
    const statuses: number[] = [];
    for (let i = 0; i < 121; i++) {
      statuses.push(
        (await t.app.request(`/api/${slug}/join`, json({ code, wave: 'wave-1' }))).status,
      );
    }
    expect(statuses[0]).toBe(200);
    expect(statuses.slice(1, 120).every((s) => s === 409)).toBe(true);
    expect(statuses[120]).toBe(429);
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

  it('a burst of guessed codes writes one bucket row for the workshop, never one per code', async () => {
    const t = await freshApp();
    const before = await countRateBuckets(t.db);
    for (let i = 0; i < 40; i++) {
      await t.app.request(`/api/${slug}/me`, { headers: auth(generateCode()) });
    }
    // Forty guesses, thirty answered AUTH_CODE_UNKNOWN and ten RATE_LIMITED, all in the one
    // unknown-code bucket of this workshop and minute. No guess left a row keyed by its hash.
    expect((await countRateBuckets(t.db)) - before).toBe(1);
  });

  it('a burst of wave opens or guessed codes in one workshop leaves another workshop its own budgets', async () => {
    const t = await freshApp();
    await seedWorkshop(t.db, { slug: 'other-one' });
    const other = await joined(t.app, 'other-one');
    await untilLimited(
      t,
      () => t.app.request(`/api/${slug}/waves/wave-1/opened`, { method: 'POST' }),
      120,
    );
    await untilLimited(
      t,
      () => t.app.request(`/api/${slug}/me`, { headers: auth(generateCode()) }),
      30,
    );
    expect(
      (await t.app.request('/api/other-one/waves/wave-1/opened', { method: 'POST' })).status,
    ).toBe(200);
    const guessed = await t.app.request('/api/other-one/me', { headers: auth(generateCode()) });
    expect(errorResponseSchema.parse(await guessed.json()).error).toBe('AUTH_CODE_UNKNOWN');
    expect((await t.app.request('/api/other-one/me', { headers: auth(other) })).status).toBe(200);
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

describe("the limiter's rows", () => {
  it('every hundredth check deletes the buckets older than an hour, so the table stays about an hour deep', async () => {
    const t = await freshApp();
    // One health call every two minutes for 200 minutes: a new bucket row each time.
    for (let i = 1; i < PRUNE_EVERY_CHECKS; i++) {
      t.clock.advanceMinutes(2);
      expect((await t.app.request('/api/health')).status).toBe(200);
    }
    expect(await countRateBuckets(t.db)).toBe(PRUNE_EVERY_CHECKS - 1);
    t.clock.advanceMinutes(2);
    expect((await t.app.request('/api/health')).status).toBe(200);
    // The hundredth check pruned: of the 100 rows, only the ones from the last hour remain,
    // which is 31 (minutes 140 to 200 inclusive, in steps of two).
    expect(await countRateBuckets(t.db)).toBe(31);
    expect(t.lines).toEqual([]);
  });

  it('refused requests count towards the prune too, so a flood cleans up after itself', async () => {
    const t = await freshApp();
    const code = await joined(t.app);
    t.clock.advanceMinutes(90); // the join's buckets are now older than an hour
    for (let i = 0; i < PRUNE_EVERY_CHECKS; i++) {
      await t.app.request(`/api/${slug}/me`, { headers: auth(code) });
    }
    // 60 allowed, 40 refused, one bucket row for the code this minute; the join's rows are gone.
    expect(await countRateBuckets(t.db)).toBe(1);
  });
});
