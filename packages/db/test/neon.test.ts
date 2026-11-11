import { describe, expect, it } from 'vitest';
import { connect, migrateNeonDatabase } from '../src/connect.ts';
import { connectNeon, NEON_URL_REFUSED } from '../src/neon.ts';

// Strings that start like a connection string but that Neon's driver would refuse on the first
// query, quoting them whole in its error (packages/db/src/neon.ts says why that matters).
const SECRET = 'not-really-secret';
const REFUSED = [
  `postgresql://neondb_owner:${SECRET}@[ep-example/neondb`,
  `postgresql://neondb_owner:${SECRET}@ep-example.neon.tech/`,
  `postgresql://:${SECRET}@ep-example.neon.tech/neondb`,
  `postgres://neondb_owner:${SECRET}@-/neondb`,
];

/** The message of what `run` throws, or fails the test when it throws nothing. */
async function thrown(run: () => unknown): Promise<string> {
  try {
    await run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected a throw');
}

describe('a connection string the Neon driver would quote in its error', () => {
  it('is refused before the driver sees it, by every way in, and the refusal never carries it', async () => {
    for (const url of REFUSED) {
      for (const message of [
        await thrown(() => connectNeon(url)),
        await thrown(() => connect(url)),
        await thrown(() => migrateNeonDatabase(url)),
      ]) {
        expect(message, url.slice(0, 20)).toBe(NEON_URL_REFUSED);
        expect(message).not.toContain(SECRET);
        expect(message).not.toContain('neondb_owner');
      }
    }
  });

  it('a well-formed string is accepted without touching the network', () => {
    // .invalid never resolves (RFC 2606); neon() makes no request until the first query.
    expect(() => connectNeon('postgres://wb:nobody@db.invalid/neondb')).not.toThrow();
    expect(() =>
      connectNeon('postgresql://wb:nobody@db.invalid/neondb?sslmode=require'),
    ).not.toThrow();
  });
});
