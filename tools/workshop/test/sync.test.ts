import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { connect } from '../../../packages/db/src/connect.ts';
import { setWorkshopStatus, waves, workshops } from '../../../packages/db/src/index.ts';

const script = fileURLToPath(new URL('../sync.ts', import.meta.url));
const folder = new URL('../../../workshops/rural-manufacturing/', import.meta.url);
const production = JSON.parse(readFileSync(new URL('workshop.json', folder), 'utf8'));
const staging = JSON.parse(readFileSync(new URL('workshop.staging.json', folder), 'utf8'));

/** Runs the tool with a clean environment: only the variables given, never the laptop's own. */
function sync(env: Record<string, string>, args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env },
  });
}

/** A Postgres on disk the tool can be run against; `read` opens it and returns the workshop and its waves. */
function scratch() {
  const url = 'pglite://' + join(mkdtempSync(join(tmpdir(), 'wb-sync-')), 'db');
  const read = async () => {
    const db = await connect(url);
    const [workshop] = await db
      .select()
      .from(workshops)
      .where(eq(workshops.slug, 'rural-manufacturing'));
    const ws = workshop
      ? await db.select().from(waves).where(eq(waves.workshopId, workshop.id))
      : [];
    const close = (db as unknown as { $client: { close(): Promise<void> } }).$client.close();
    await close;
    return { workshop, waves: ws };
  };
  const set = async (status: 'draft' | 'open' | 'closed') => {
    const db = await connect(url);
    await setWorkshopStatus(db, 'rural-manufacturing', status);
    await (db as unknown as { $client: { close(): Promise<void> } }).$client.close();
  };
  return { url, read, set };
}

describe('workshop sync', () => {
  it('does nothing without DATABASE_URL and says so', () => {
    const run = sync({});
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('DATABASE_URL not set, nothing to do');
  });

  it('loads the folder with the staging key outside production, opens the workshop and creates wave-1 once', async () => {
    const db = scratch();
    const first = sync({ DATABASE_URL: db.url, VITE_WB_ENV: 'staging' });
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain(
      `sync: rural-manufacturing (staging, key ${staging.keyFingerprint}, opens ${staging.opensDay}) draft -> open`,
    );
    let { workshop, waves: ws } = await db.read();
    expect(workshop?.status).toBe('open');
    expect(workshop?.publicKey).toBe(staging.publicKey);
    expect(workshop?.keyFingerprint).toBe(staging.keyFingerprint);
    expect(workshop?.opensDay).toBe(staging.opensDay);
    expect(workshop?.closesDay).toBe(production.closesDay);
    expect(workshop?.cap).toBe(production.cap);
    expect(ws.map((w) => w.wave)).toEqual(['wave-1']);

    // The row is read after the upsert, so a new workshop reports draft -> open, which is what
    // happened. A second deploy upserts: still one row, still one wave-1, counts untouched.
    const second = sync({ DATABASE_URL: db.url, VITE_WB_ENV: 'staging' });
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain('open -> open');
    ({ workshop, waves: ws } = await db.read());
    expect(workshop?.status).toBe('open');
    expect(ws).toHaveLength(1);
    expect(ws[0]?.wave).toBe('wave-1');
  });

  it('seals to the production key when the context is production', async () => {
    const db = scratch();
    const run = sync({ DATABASE_URL: db.url, VITE_WB_ENV: 'production' });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(
      `(production, key ${production.keyFingerprint}, opens ${production.opensDay})`,
    );
    const { workshop } = await db.read();
    expect(workshop?.publicKey).toBe(production.publicKey);
    expect(workshop?.keyFingerprint).toBe(production.keyFingerprint);
    expect(workshop?.opensDay).toBe(production.opensDay);
  });

  it('turns draft into open and leaves a closed workshop closed', async () => {
    const db = scratch();
    expect(sync({ DATABASE_URL: db.url, VITE_WB_ENV: 'staging' }).status).toBe(0);
    await db.set('draft');
    const reopened = sync({ DATABASE_URL: db.url, VITE_WB_ENV: 'staging' });
    expect(reopened.status).toBe(0);
    expect(reopened.stdout).toContain('draft -> open');
    expect((await db.read()).workshop?.status).toBe('open');

    await db.set('closed');
    const stillClosed = sync({ DATABASE_URL: db.url, VITE_WB_ENV: 'staging' });
    expect(stillClosed.status).toBe(0);
    expect(stillClosed.stdout).toContain('closed -> closed');
    expect((await db.read()).workshop?.status).toBe('closed');
  });

  it('refuses a connection string of the wrong shape, and anything on the command line', () => {
    const wrong = sync({
      DATABASE_URL: "psql 'postgresql://nobody:not-really-secret@db.invalid/neondb'",
    });
    expect(wrong.status).not.toBe(0);
    expect(wrong.stdout + wrong.stderr).not.toContain('not-really-secret');
    for (const args of [['--help'], ['rural-manufacturing']]) {
      const run = sync({}, args);
      expect(run.status, args.join(' ')).toBe(2);
      expect(run.stderr).toContain('usage');
    }
  });
});
