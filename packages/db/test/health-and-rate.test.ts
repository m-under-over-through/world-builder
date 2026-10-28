import { describe, expect, it } from 'vitest';
import { healthReport, pruneRateBuckets, rateLimitAllows, recordBackupRun } from '../src/index.ts';
import { freshDb, seedWorkshop } from './helpers.ts';

describe('health report', () => {
  it('reports no backup until one is recorded, and lists workshops by slug and status only', async () => {
    const db = await freshDb();
    await seedWorkshop(db);
    expect(await healthReport(db, '2026-11-16')).toEqual({
      lastBackupAt: null,
      eventsToday: 0,
      workshops: [{ slug: 'rural-manufacturing', status: 'open' }],
    });
    await recordBackupRun(db, 'database', true, new Date('2026-11-16T03:00:00Z'));
    await recordBackupRun(db, 'database', false, new Date('2026-11-17T03:00:00Z'));
    expect((await healthReport(db, '2026-11-16')).lastBackupAt).toContain('2026-11-16');
  });
});

describe('rate limiting without addresses', () => {
  it('allows up to the limit within a minute, then refuses, then allows again next minute', async () => {
    const db = await freshDb();
    const input = {
      route: 'join',
      subject: 'workshop-x',
      limitPerMinute: 3,
      now: new Date('2026-11-16T12:00:30Z'),
    };
    expect(await rateLimitAllows(db, input)).toBe(true);
    expect(await rateLimitAllows(db, input)).toBe(true);
    expect(await rateLimitAllows(db, input)).toBe(true);
    expect(await rateLimitAllows(db, input)).toBe(false);
    expect(await rateLimitAllows(db, { ...input, now: new Date('2026-11-16T12:01:00Z') })).toBe(
      true,
    );
    expect(await rateLimitAllows(db, { ...input, subject: 'workshop-y' })).toBe(true);
  });

  it('pruning removes buckets older than an hour', async () => {
    const db = await freshDb();
    const old = new Date('2026-11-16T10:00:00Z');
    await rateLimitAllows(db, { route: 'r', subject: 's', limitPerMinute: 1, now: old });
    await pruneRateBuckets(db, new Date('2026-11-16T12:00:00Z'));
    expect(
      await rateLimitAllows(db, { route: 'r', subject: 's', limitPerMinute: 1, now: old }),
    ).toBe(true);
  });
});
