import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { connect } from '../../../packages/db/src/connect.ts';
import {
  createInvites,
  deleteParticipant,
  ensureWave,
  events,
  findWorkshop,
  joinViaInvite,
  joinViaWave,
  recordBackupRun,
  sessions,
  waveOpened,
  type Db,
} from '../../../packages/db/src/index.ts';
import { freshDb, realDeck, seedWorkshop } from '../../../packages/db/test/helpers.ts';
import { formatStatus, readStatus } from '../status.ts';

const script = fileURLToPath(new URL('../status.ts', import.meta.url));
const TODAY = '2026-11-18';
const A = 'rural-manufacturing';
const B = 'worldbuilding-class';

/** What the fixture made, so a test can look for each of these in the output and not find it. */
type Secrets = { codes: string[]; hashes: string[]; ids: string[] };

/** A 16-digit code and its keyed hash, made the way the API makes them (ADR 0002). */
function code(secrets: Secrets, slug: string) {
  const digits = String(1e15 + Math.floor(Math.random() * 9e15));
  const hashed = createHmac('sha256', 'test-pepper').update(`${slug}:${digits}`).digest('hex');
  secrets.codes.push(digits);
  secrets.hashes.push(hashed);
  return hashed;
}

/** One session on `day` holding one event per kind given, on the deck's cards in order. */
async function session(
  db: Db,
  secrets: Secrets,
  participantId: string,
  day: string,
  kinds: string[],
) {
  const sessionId = crypto.randomUUID();
  secrets.ids.push(participantId, sessionId);
  await db.insert(sessions).values({
    id: sessionId,
    participantId,
    sessionNo: 1,
    startedDay: day,
    deckVersion: realDeck.version,
    seed: '0123456789abcdef',
  });
  for (const [seq, kind] of kinds.entries()) {
    const id = crypto.randomUUID();
    secrets.ids.push(id);
    await db.insert(events).values({
      id,
      sessionId,
      cardId: realDeck.cards[seq]!.id,
      seq,
      kind,
      body: kind === 'answered' ? `v1.${Buffer.from(`sealed ${id}`).toString('base64')}` : null,
      createdDay: day,
      deckVersion: realDeck.version,
    });
  }
}

/**
 * Workshop A, with every count different from the next so a swapped number shows:
 * - wave-1 opened 5 times, 4 joins (16, 16, 17 and 18 November); the one on the 18th then used
 *   "delete me", so wave-1 has joined 4 and 3 still in. wave-2 opened twice, 1 join on the 18th.
 * - P1 created 2 invites; one was spent by P5, who joined on the 17th.
 * - Sessions: P1 two (16th: 3 answered and a dismiss; 17th: an answer and a defer), P2 one (16th:
 *   an answer and a shown), P3 one (17th: a shown and a dismiss), P5 one (18th: an answer and a
 *   revisit). The deleted participant's session went with them.
 * - Backups: the database's on the 17th, then a failed run on the 18th; this workshop's on the 17th.
 */
async function seedA(db: Db, secrets: Secrets) {
  const id = await seedWorkshop(db, A);
  await ensureWave(db, id, 'wave-2', 'second newsletter');
  const workshop = (await findWorkshop(db, A))!;
  for (let i = 0; i < 5; i++) await waveOpened(db, id, 'wave-1');
  for (let i = 0; i < 2; i++) await waveOpened(db, id, 'wave-2');
  const join = async (wave: string, today: string) => {
    const r = await joinViaWave(db, { workshop, wave, codeHash: code(secrets, A), today });
    if (!r.ok) throw new Error(r.reason);
    return r.participant;
  };
  const p1 = await join('wave-1', '2026-11-16');
  const p2 = await join('wave-1', '2026-11-16');
  const p3 = await join('wave-1', '2026-11-17');
  const p4 = await join('wave-2', '2026-11-18');
  const tokens = [code(secrets, 'token'), code(secrets, 'token')];
  expect(await createInvites(db, p1, tokens)).toBe(2);
  const invited = await joinViaInvite(db, {
    workshop,
    tokenHash: tokens[0]!,
    codeHash: code(secrets, A),
    today: '2026-11-17',
  });
  if (!invited.ok) throw new Error(invited.reason);
  const p5 = invited.participant;
  const p6 = await join('wave-1', '2026-11-18');

  await session(db, secrets, p1.id, '2026-11-16', [
    'answered',
    'answered',
    'answered',
    'dismissed',
  ]);
  await session(db, secrets, p1.id, '2026-11-17', ['answered', 'deferred']);
  await session(db, secrets, p2.id, '2026-11-16', ['answered', 'shown']);
  await session(db, secrets, p3.id, '2026-11-17', ['shown', 'dismissed']);
  await session(db, secrets, p5.id, '2026-11-18', ['answered', 'revisited']);
  await session(db, secrets, p6.id, '2026-11-18', ['answered', 'answered', 'answered']);
  await deleteParticipant(db, p6.id);
  secrets.ids.push(p4.id);

  await recordBackupRun(db, 'database', true, new Date('2026-11-17T07:21:43Z'));
  await recordBackupRun(db, 'database', false, new Date('2026-11-18T07:22:10Z'));
  await recordBackupRun(db, `workshop:${A}`, true, new Date('2026-11-17T07:21:50Z'));
}

/** Workshop B, busier than A on every count, so any of its rows in A's numbers would show. */
async function seedB(db: Db, secrets: Secrets) {
  const id = await seedWorkshop(db, B);
  await ensureWave(db, id, 'wave-2', 'class list');
  const workshop = (await findWorkshop(db, B))!;
  for (let i = 0; i < 11; i++) await waveOpened(db, id, 'wave-1');
  for (let i = 0; i < 7; i++) {
    const r = await joinViaWave(db, {
      workshop,
      wave: i < 4 ? 'wave-1' : 'wave-2',
      codeHash: code(secrets, B),
      today: '2026-11-16',
    });
    if (!r.ok) throw new Error(r.reason);
    await session(db, secrets, r.participant.id, '2026-11-17', ['answered', 'answered', 'shown']);
    await createInvites(db, r.participant, [code(secrets, 'token')]);
  }
  await recordBackupRun(db, `workshop:${B}`, true, new Date('2026-11-18T07:23:00Z'));
}

const window7 = (counts: Record<string, number>) =>
  [
    '2026-11-12',
    '2026-11-13',
    '2026-11-14',
    '2026-11-15',
    '2026-11-16',
    '2026-11-17',
    '2026-11-18',
  ].map((day) => ({ day, n: counts[day] ?? 0 }));

/** Runs the command as Marco would, with a clean environment: only the variables given. */
function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env },
  });
}

/** Nothing that identifies a person or a row may appear in what the command prints. */
function expectNothingIdentifying(text: string, secrets: Secrets) {
  expect(text).not.toMatch(/\d{16}/);
  expect(text).not.toMatch(/\d{1,2}:\d{2}/); // no time of day, only days
  for (const c of secrets.codes) expect(text).not.toContain(c);
  for (const h of secrets.hashes) {
    expect(text).not.toContain(h);
    expect(text).not.toContain(h.slice(0, 12));
  }
  for (const id of secrets.ids) {
    expect(text).not.toContain(id);
    expect(text).not.toContain(id.slice(0, 8));
  }
  for (const card of realDeck.cards) {
    expect(text).not.toContain(card.text);
    // A one-word id such as "failed" is also an ordinary word of the report; a hyphenated one is not.
    if (card.id.includes('-')) expect(text).not.toContain(card.id);
  }
  expect(text).not.toContain('v1.');
}

describe('workshop status', () => {
  it("counts a seeded workshop's waves, participants, sessions, events, answers, invites and backups", async () => {
    const db = await freshDb();
    await seedA(db, { codes: [], hashes: [], ids: [] });
    const r = (await readStatus(db, A, { today: TODAY, days: 7 }))!;

    expect(r).toMatchObject({
      slug: A,
      status: 'open',
      opensDay: '2026-11-16',
      closesDay: '2026-12-06',
    });
    expect(r.waves).toEqual([
      { wave: 'wave-1', label: 'first newsletter', opened: 5, joined: 4, stillIn: 3, cap: 150 },
      { wave: 'wave-2', label: 'second newsletter', opened: 2, joined: 1, stillIn: 1, cap: 150 },
    ]);
    expect(r.participants).toEqual({ all: 5, throughWave: 4, throughInvite: 1 });
    expect(r.joinedPerDay).toEqual(window7({ '2026-11-16': 2, '2026-11-17': 2, '2026-11-18': 1 }));
    expect(r.sessions).toBe(5);
    expect(r.events.all).toBe(12);
    expect(r.events.byKind).toEqual([
      { kind: 'shown', n: 2 },
      { kind: 'answered', n: 6 },
      { kind: 'dismissed', n: 2 },
      { kind: 'deferred', n: 1 },
      { kind: 'revisited', n: 1 },
    ]);
    expect(r.answersPerDay).toEqual(window7({ '2026-11-16': 4, '2026-11-17': 1, '2026-11-18': 1 }));
    // P1 answered 4 times, P2 once, P5 once: three participants, median 1, largest 4.
    expect(r.answering).toEqual({ participants: 3, median: 1, largest: 4 });
    expect(r.invites).toEqual({ created: 2, spent: 1 });
    expect(r.backups).toEqual({
      database: { newestOk: '2026-11-17', newestFailed: '2026-11-18' },
      workshop: { newestOk: '2026-11-17', newestFailed: null },
    });

    const text = formatStatus(r);
    expect(text).toContain('participants  5: 4 through a wave, 1 through an invite');
    expect(text).toContain('invites       2 created, 1 spent');
    expect(text).toContain('median 1, largest 4');
    expect(text).toContain(
      'database: newest 2026-11-17, 1 day before today; a failed run on 2026-11-18',
    );
    expect(text).toContain('today 2026-11-18 (UTC), day 3 of 21');
  });

  it("never lets a second workshop's rows into the first one's numbers", async () => {
    const alone = await freshDb();
    await seedA(alone, { codes: [], hashes: [], ids: [] });
    const expected = await readStatus(alone, A, { today: TODAY, days: 7 });

    const both = await freshDb();
    await seedB(both, { codes: [], hashes: [], ids: [] });
    await seedA(both, { codes: [], hashes: [], ids: [] });
    expect(await readStatus(both, A, { today: TODAY, days: 7 })).toEqual(expected);

    // And B's numbers are B's own, with none of A's.
    const b = (await readStatus(both, B, { today: TODAY, days: 7 }))!;
    expect(b.participants).toEqual({ all: 7, throughWave: 7, throughInvite: 0 });
    expect(b.waves.map((w) => [w.wave, w.opened, w.joined])).toEqual([
      ['wave-1', 11, 4],
      ['wave-2', 0, 3],
    ]);
    expect(b.sessions).toBe(7);
    expect(b.events.all).toBe(21);
    expect(b.answering).toEqual({ participants: 7, median: 2, largest: 2 });
    expect(b.invites).toEqual({ created: 7, spent: 0 });
    // The database's own backup is shared; each workshop sees its own workshop backup only.
    expect(b.backups.workshop).toEqual({ newestOk: '2026-11-18', newestFailed: null });
    expect(b.backups.database).toEqual(expected!.backups.database);
  });

  it('prints no code, no code hash, no id, no card and no time finer than a day', async () => {
    const secrets: Secrets = { codes: [], hashes: [], ids: [] };
    const db = await freshDb();
    await seedB(db, secrets);
    await seedA(db, secrets);
    for (const slug of [A, B]) {
      expectNothingIdentifying(
        formatStatus((await readStatus(db, slug, { today: TODAY, days: 30 }))!),
        secrets,
      );
    }
  });

  it('shows every day of the window, a quiet one as 0, and a day after today at the end', async () => {
    const db = await freshDb();
    await seedA(db, { codes: [], hashes: [], ids: [] });
    const r = (await readStatus(db, A, { today: '2026-11-17', days: 3 }))!;
    // The 18th is after this "today": a device whose clock runs ahead still has its answer counted.
    expect(r.answersPerDay).toEqual([
      { day: '2026-11-15', n: 0 },
      { day: '2026-11-16', n: 4 },
      { day: '2026-11-17', n: 1 },
      { day: '2026-11-18', n: 1 },
    ]);
    const empty = await freshDb();
    await seedWorkshop(empty, B);
    const quiet = (await readStatus(empty, B, { today: '2026-11-10', days: 2 }))!;
    expect(quiet.answering).toEqual({ participants: 0, median: 0, largest: 0 });
    const text = formatStatus(quiet);
    expect(text).toContain('opens in 6 days');
    expect(text).toContain('database: none recorded');
    expect(text).toContain('0 created, 0 spent');
  });

  it('returns nothing for a slug no workshop has', async () => {
    const db = await freshDb();
    await seedWorkshop(db, A);
    expect(await readStatus(db, B, { today: TODAY, days: 7 })).toBeUndefined();
  });

  it('has no insert, update or delete in its source (a tripwire for a write added here, not a proof)', () => {
    const source = readFileSync(script, 'utf8');
    expect(source).not.toMatch(/\.(insert|update|delete|execute)\s*\(/);
    expect(source).not.toMatch(
      /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|truncate|drop\s+table|alter\s+table)\b/i,
    );
  });
});

describe('workshop status, the command', () => {
  it('prints the report for a seeded database, with nothing identifying in it', async () => {
    const secrets: Secrets = { codes: [], hashes: [], ids: [] };
    const url = 'pglite://' + join(mkdtempSync(join(tmpdir(), 'wb-status-')), 'db');
    const db = await connect(url);
    await seedB(db, secrets);
    await seedA(db, secrets);
    await (db as unknown as { $client: { close(): Promise<void> } }).$client.close();

    const r = run([A, '--days', '3'], { DATABASE_URL: url });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toContain(`workshop      ${A}`);
    expect(r.stdout).toContain('participants  5: 4 through a wave, 1 through an invite');
    expect(r.stdout).toContain('joined per day, last 3 days');
    expect(r.stdout).toContain('invites       2 created, 1 spent');
    expectNothingIdentifying(r.stdout, secrets);
    expect(r.stdout).not.toContain(url);
  });

  it('ends with a clear line and exit 2 without DATABASE_URL, before touching anything', () => {
    const r = run([A]);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('DATABASE_URL is not set');
    expect(r.stderr).toContain('Watching a workshop');
  });

  it('ends with exit 1 for a slug no workshop has', () => {
    const r = run([B], { DATABASE_URL: 'pglite://memory' });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain(`no workshop "${B}" in this database`);
  });

  it('rejects an unknown flag, a bad --days or a bad slug with the usage and exit 2', () => {
    for (const args of [
      [A, '--verbose'],
      [A, '--days'],
      [A, '--days', '0'],
      [A, '--days', 'seven'],
      [A, '--days', '400'],
      [A, '--days=3'],
      [A, '--debug=1'],
      ['Rural-Manufacturing'],
      ['--days', '3'],
      [],
    ]) {
      const r = run(args, { DATABASE_URL: 'pglite://memory' });
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr, args.join(' ')).toContain('usage');
      expect(r.stdout).toBe('');
    }
    expect(run([A, '--verbose']).stderr).toContain('unknown argument "--verbose"');
  });

  it('never echoes a connection string, whether passed as an argument or set in the wrong shape', () => {
    const secret = 'postgresql://nobody:not-really-secret@db.invalid/neondb';
    for (const args of [[A, secret], [secret], [A, '--db', secret]]) {
      const r = run(args, { DATABASE_URL: 'pglite://memory' });
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stdout + r.stderr).not.toContain('not-really-secret');
    }
    const wrong = run([A], { DATABASE_URL: `psql '${secret}'` });
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain('could not open the database with this address');
    expect(wrong.stdout + wrong.stderr).not.toContain('not-really-secret');
  });

  it("prints one fixed line with the error's class when the address is refused, and the message only with --debug", () => {
    const secret = 'postgresql://nobody:not-really-secret@db.invalid/neondb';
    const plain = run([A], { DATABASE_URL: `psql '${secret}'` });
    expect(plain.status).toBe(1);
    expect(plain.stderr.trim().split('\n')).toHaveLength(1);
    expect(plain.stderr).toContain('could not open the database with this address');
    expect(plain.stderr).toContain('(Error)');
    expect(plain.stderr).toContain('--debug');
    // The driver's own words stay out by default.
    expect(plain.stderr).not.toContain('must start with');

    const debug = run([A, '--debug'], { DATABASE_URL: `psql '${secret}'` });
    expect(debug.status).toBe(1);
    expect(debug.stderr).toContain('debug: DATABASE_URL must start with');
    expect(debug.stdout + debug.stderr).not.toContain('not-really-secret');
  });

  it("names the read step and the database's error code when a query fails, and the message only with --debug", async () => {
    const url = 'pglite://' + join(mkdtempSync(join(tmpdir(), 'wb-status-broken-')), 'db');
    const db = await connect(url);
    await seedWorkshop(db, A);
    // A table the status queries read, gone: the first select on it fails inside the database.
    await db.execute(sql`drop table backup_runs`);
    await (db as unknown as { $client: { close(): Promise<void> } }).$client.close();

    const plain = run([A], { DATABASE_URL: url });
    expect(plain.status).toBe(1);
    expect(plain.stdout).toBe('');
    expect(plain.stderr).toContain('the database did not answer the status queries');
    expect(plain.stderr).toContain('(DrizzleQueryError, 42P01)'); // Postgres: undefined table
    expect(plain.stderr.trim().split('\n')).toHaveLength(1);
    expect(plain.stderr).not.toContain('backup_runs');

    const debug = run([A, '--debug'], { DATABASE_URL: url });
    expect(debug.status).toBe(1);
    expect(debug.stderr).toContain('debug: ');
    expect(debug.stderr).toContain('backup_runs');
  });
});
