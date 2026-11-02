import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { deckSchema, generateCode, workshopConfigSchema, type WorkshopConfig } from '@wb/contracts';
import { ensureWave, setWorkshopStatus, syncWorkshop, type Db } from '@wb/db';
import { connect } from '@wb/db/connect';
import { createApp, type App } from '../src/app.ts';
import type { Logger } from '../src/log.ts';

/**
 * What every API test needs: the real workshop folder, a fixed pepper, a clock the test can move,
 * a fresh in-memory Postgres, and the app on it with its log lines kept in an array. The API is
 * exercised through app.request(), the same entry point the Netlify Function calls. No network,
 * no mocks.
 */

const folder = new URL('../../../workshops/rural-manufacturing/', import.meta.url);
export const workshopConfig = workshopConfigSchema.parse(
  JSON.parse(readFileSync(new URL('workshop.json', folder), 'utf8')),
);
export const deck = deckSchema.parse(
  JSON.parse(readFileSync(new URL('deck.json', folder), 'utf8')),
);
export const slug = workshopConfig.slug;

// 32 zero bytes in base64: a fixed test pepper. Never used anywhere real.
export const TEST_PEPPER = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
/** A day inside the real workshop's window. */
export const DAY = '2026-11-20';

/** A clock the tests move: by day (the workshop window) and by minute (the rate buckets). */
export function testClock(day = DAY) {
  let current = new Date(`${day}T12:00:00Z`);
  return {
    now: () => current,
    setDay(newDay: string) {
      current = new Date(`${newDay}T12:00:00Z`);
    },
    advanceMinutes(n: number) {
      current = new Date(current.getTime() + n * 60_000);
    },
  };
}
export type TestClock = ReturnType<typeof testClock>;

/** Loads the real workshop under a slug, with overrides, opens it, and adds wave-1. Returns the row id. */
export async function seedWorkshop(
  db: Db,
  overrides: Partial<WorkshopConfig> = {},
): Promise<string> {
  const config = { ...workshopConfig, ...overrides };
  const { id } = await syncWorkshop(db, config, deck);
  await setWorkshopStatus(db, config.slug, 'open');
  await ensureWave(db, id, 'wave-1', 'first');
  return id;
}

export interface TestApp {
  app: App;
  db: Db;
  clock: TestClock;
  /** Every line the app logged, so a test can read what was written and prove what was not. */
  lines: string[];
}

/** A fresh database with the real workshop open, and an app on it. */
export async function freshApp(): Promise<TestApp> {
  const db = await connect('pglite://memory');
  await seedWorkshop(db);
  const clock = testClock();
  const lines: string[] = [];
  const log: Logger = {
    warn: (line) => lines.push(line),
    error: (line) => lines.push(line),
  };
  const app = createApp({ db, pepper: TEST_PEPPER, version: 'test', now: clock.now, log });
  return { app, db, clock, lines };
}

export const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
export const auth = (code: string) => ({ authorization: `Code ${code}` });
export const session = (sessionNo = 1) => ({
  id: crypto.randomUUID(),
  sessionNo,
  startedDay: DAY,
  deckVersion: '0.1',
  seed: '0123456789abcdef',
});
export const answered = (sessionId: string, seq = 0) => ({
  id: crypto.randomUUID(),
  sessionId,
  cardId: 'tuesday-night',
  seq,
  kind: 'answered',
  body: 'v1.' + 'A'.repeat(64),
  createdDay: DAY,
  deckVersion: '0.1',
});

/** Joins a new code through wave-1 and returns it. */
export async function joined(app: App, workshopSlug = slug): Promise<string> {
  const code = generateCode();
  const res = await app.request(`/api/${workshopSlug}/join`, json({ code, wave: 'wave-1' }));
  expect(res.status).toBe(200);
  return code;
}
