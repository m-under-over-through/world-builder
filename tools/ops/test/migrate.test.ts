import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../migrate.ts', import.meta.url));

/** Runs the tool with a clean environment: only the variables given, never the laptop's own. */
function migrate(env: Record<string, string>, args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env },
  });
}

// A string in the shape Neon hands out, with a password that must never reach a log line.
const PLAIN =
  'postgresql://neondb_owner:not-really-secret@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';

describe('migrate', () => {
  it('does nothing without DATABASE_URL and says so', () => {
    const run = migrate({});
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('DATABASE_URL not set, nothing to do');
  });

  it('refuses a value that is not the plain connection string, before touching anything, and never prints it', () => {
    for (const shape of [
      `psql '${PLAIN}'`,
      `DATABASE_URL='${PLAIN}'`,
      `'${PLAIN}'`,
      `"${PLAIN}"`,
      ` ${PLAIN}`,
      'pglite://memory',
      'mysql://nobody@db.invalid/neondb',
      'neondb',
    ]) {
      const run = migrate({ DATABASE_URL: shape });
      expect(run.status, shape.slice(0, 20)).toBe(1);
      expect(run.stderr).toContain('migrate: expected a postgres:// URL in this context');
      expect(run.stderr).toContain('plain connection string');
      expect(run.stdout + run.stderr).not.toContain('not-really-secret');
    }
  });

  it('rejects anything on the command line', () => {
    for (const args of [['--help'], ['--db', 'pglite://memory'], ['staging']]) {
      const run = migrate({}, args);
      expect(run.status, args.join(' ')).toBe(2);
      expect(run.stderr).toContain('usage');
    }
  });
});
