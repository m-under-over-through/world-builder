import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deckSchema, workshopConfigSchema } from '../../../packages/contracts/src/index.ts';
import { fingerprint, generateKeyPair, sealAnswer } from '../../../packages/crypto/src/index.ts';
import { connect } from '../../../packages/db/src/connect.ts';
import {
  ensureWave,
  events,
  participants,
  sessions,
  setWorkshopStatus,
  syncWorkshop,
} from '../../../packages/db/src/index.ts';

const script = fileURLToPath(new URL('../export.ts', import.meta.url));
const folder = new URL('../../../workshops/rural-manufacturing/', import.meta.url);
const config = workshopConfigSchema.parse(
  JSON.parse(readFileSync(new URL('workshop.json', folder), 'utf8')),
);
const deck = deckSchema.parse(JSON.parse(readFileSync(new URL('deck.json', folder), 'utf8')));

const COLUMNS = [
  'participant',
  'joined_day',
  'via',
  'session',
  'session_day',
  'seq',
  'card',
  'kind',
  'event_day',
  'deck',
  'answer',
];

/**
 * A workshop in a Postgres on disk, sealed to a key made for the test, with a few participants
 * who each answered once and dismissed once. The database is closed before the tool runs, since
 * the tool is a separate process. Returns what the tool needs and what the test checks against.
 */
async function sealedFixture(answers: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-export-'));
  const kp = generateKeyPair();
  const keyFile = join(dir, 'test.private-key');
  writeFileSync(keyFile, kp.privateKey + '\n', { mode: 0o600 });
  const db = await connect('pglite://' + join(dir, 'db'));
  const { id: workshopId } = await syncWorkshop(db, config, deck, {
    publicKey: kp.publicKey,
    keyFingerprint: fingerprint(kp.publicKey),
  });
  await setWorkshopStatus(db, config.slug, 'open');
  await ensureWave(db, workshopId, 'wave-1', 'test');
  const ids: string[] = [];
  for (const [i, answer] of answers.entries()) {
    const [p] = await db
      .insert(participants)
      .values({
        workshopId,
        codeHash: `hash-${i}`.padEnd(64, '0'),
        createdDay: '2026-11-16',
        wave: i % 2 === 0 ? 'wave-1' : null,
        invitesLeft: 3,
      })
      .returning({ id: participants.id });
    ids.push(p!.id);
    const sessionId = crypto.randomUUID();
    await db.insert(sessions).values({
      id: sessionId,
      participantId: p!.id,
      sessionNo: 1,
      startedDay: '2026-11-17',
      deckVersion: deck.version,
      seed: 'seed',
    });
    await db.insert(events).values([
      {
        id: crypto.randomUUID(),
        sessionId,
        cardId: 'w-01',
        seq: 0,
        kind: 'answered',
        body: sealAnswer(kp.publicKey, answer),
        createdDay: '2026-11-17',
        deckVersion: deck.version,
      },
      {
        id: crypto.randomUUID(),
        sessionId,
        cardId: 'w-02',
        seq: 1,
        kind: 'dismissed',
        body: null,
        createdDay: '2026-11-17',
        deckVersion: deck.version,
      },
    ]);
  }
  await (db as unknown as { $client: { close(): Promise<void> } }).$client.close();
  return {
    dbUrl: 'pglite://' + join(dir, 'db'),
    keyFile,
    out: join(dir, 'out'),
    participantIds: ids,
    keyFingerprint: fingerprint(kp.publicKey),
  };
}

function run(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

/** The one CSV file the tool wrote into `out`, or undefined. */
function exported(out: string): string | undefined {
  let names: string[];
  try {
    names = readdirSync(out);
  } catch {
    return undefined;
  }
  const name = names.find((n) => /^rural-manufacturing-\d{4}-\d{2}-\d{2}\.csv$/.test(n));
  return name && join(out, name);
}

/** Every field is quoted; a quote inside is doubled; a field may hold commas and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') ((field += '"'), i++);
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(field), (field = ''));
    else if (c === '\n') (row.push(field), rows.push(row), (row = []), (field = ''));
    else field += c;
  }
  if (field || row.length) (row.push(field), rows.push(row));
  return rows;
}

describe('workshop export', () => {
  it('opens every answer into a CSV with the expected columns, one pseudonym per participant, no server id anywhere', async () => {
    const answers = ['A quiet workshop, "almost" empty', 'Comma, newline\nand emoji 🏭 at the end'];
    const f = await sealedFixture(answers);
    const r = run(['rural-manufacturing', '--key', f.keyFile, '--db', f.dbUrl, '--out', f.out]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('participants:  2');
    expect(r.stdout).toContain('events:        4 (2 answers opened)');

    const file = exported(f.out)!;
    expect(file).toBeDefined();
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(f.out).mode & 0o777).toBe(0o700);
    const text = readFileSync(file, 'utf8');
    const [header, ...rows] = parseCsv(text);
    expect(header).toEqual(COLUMNS);
    expect(rows).toHaveLength(4);
    const opened = rows.filter((row) => row[7] === 'answered').map((row) => row[10]);
    expect(opened.sort()).toEqual([...answers].sort());
    for (const row of rows.filter((row) => row[7] === 'dismissed')) expect(row[10]).toBe('');
    // One pseudonym per participant, in the shape p001, and the rows grouped by it.
    const pseudonyms = rows.map((row) => row[0]!);
    expect(new Set(pseudonyms).size).toBe(2);
    for (const p of pseudonyms) expect(p).toMatch(/^p\d{3}$/);
    expect(pseudonyms).toEqual([...pseudonyms].sort());
    // via is the wave or "invite"; days are days.
    expect(rows.map((row) => row[2]).sort()).toEqual(['invite', 'invite', 'wave-1', 'wave-1']);
    expect(rows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row[1]!))).toBe(true);
    // Nothing that identifies a row on the server reaches the file or the terminal.
    for (const id of f.participantIds) {
      expect(text).not.toContain(id);
      expect(r.stdout).not.toContain(id);
    }
    expect(text).not.toContain('hash-');
    for (const answer of answers) expect(r.stdout).not.toContain(answer.slice(0, 10));
    expect(r.stdout).not.toContain(readFileSync(f.keyFile, 'utf8').trim());
  });

  it('hands out fresh pseudonyms on every run, so two exports cannot be lined up', async () => {
    const answers = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
    const f = await sealedFixture(answers);
    const mappings: string[] = [];
    for (let i = 0; i < 3; i++) {
      const out = join(f.out, String(i));
      const r = run(['rural-manufacturing', '--key', f.keyFile, '--db', f.dbUrl, '--out', out]);
      expect(r.status, r.stderr).toBe(0);
      const rows = parseCsv(readFileSync(exported(out)!, 'utf8')).slice(1);
      mappings.push(
        rows
          .filter((row) => row[7] === 'answered')
          .map((row) => `${row[10]}=${row[0]}`)
          .sort()
          .join(' '),
      );
    }
    // Seven participants have 5040 orders; three identical draws by chance is one in 25 million.
    expect(new Set(mappings).size).toBeGreaterThan(1);
  });

  it("refuses to overwrite the same day's export unless --overwrite is passed", async () => {
    const f = await sealedFixture(['kept']);
    const base = ['rural-manufacturing', '--key', f.keyFile, '--db', f.dbUrl, '--out', f.out];
    expect(run(base).status).toBe(0);
    const file = exported(f.out)!;
    const before = readFileSync(file, 'utf8');
    const second = run(base);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('refusing to overwrite');
    expect(second.stderr).toContain('--overwrite');
    expect(readFileSync(file, 'utf8')).toBe(before);
    const third = run([...base, '--overwrite']);
    expect(third.status, third.stderr).toBe(0);
    expect(third.stdout).toContain('written to:');
    expect(parseCsv(readFileSync(file, 'utf8'))).toHaveLength(3);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("refuses a key that is not the workshop's, with its code, before writing anything", async () => {
    const f = await sealedFixture(['sealed to the real key']);
    const keys = mkdtempSync(join(tmpdir(), 'wb-export-keys-'));
    const otherKey = join(keys, 'other.private-key');
    writeFileSync(otherKey, generateKeyPair().privateKey + '\n', { mode: 0o600 });
    const wrong = run(['rural-manufacturing', '--key', otherKey, '--db', f.dbUrl, '--out', f.out]);
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain('CRYPTO_OPEN_FAILED');
    expect(wrong.stderr).toContain(f.keyFingerprint);
    expect(exported(f.out)).toBeUndefined();

    const malformed = join(keys, 'malformed.private-key');
    writeFileSync(malformed, 'not a key at all\n', { mode: 0o600 });
    const bad = run(['rural-manufacturing', '--key', malformed, '--db', f.dbUrl, '--out', f.out]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('CRYPTO_BAD_PRIVATE_KEY');
    expect(exported(f.out)).toBeUndefined();

    // The right key still works on the same database afterwards.
    const right = run(['rural-manufacturing', '--key', f.keyFile, '--db', f.dbUrl, '--out', f.out]);
    expect(right.status, right.stderr).toBe(0);
  });

  it('refuses an unknown workshop without writing anything', async () => {
    const f = await sealedFixture(['nobody']);
    const r = run(['worldbuilding-class', '--key', f.keyFile, '--db', f.dbUrl, '--out', f.out]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no workshop "worldbuilding-class"');
    expect(exported(f.out)).toBeUndefined();
  });

  it('rejects an unknown flag, a bad slug, a missing key or a missing key file before touching anything', () => {
    const out = mkdtempSync(join(tmpdir(), 'wb-export-args-'));
    const keyFile = join(out, 'k.private-key');
    writeFileSync(keyFile, generateKeyPair().privateKey + '\n', { mode: 0o600 });
    for (const args of [
      ['rural-manufacturing', '--key', keyFile, '--Overwrite', '--out', out],
      ['rural-manufacturing', '--key', keyFile, '--overwrite=yes', '--out', out],
      ['rural-manufacturing', '--key', keyFile, '--out'],
      ['Rural-Manufacturing', '--key', keyFile, '--out', out],
      ['rural-manufacturing', '--out', out],
      [],
    ]) {
      const r = run(args);
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr).toContain('usage');
    }
    const missing = run(['rural-manufacturing', '--key', join(out, 'nope'), '--out', out]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('no such key file');
    expect(readdirSync(out)).toEqual(['k.private-key']);
  });
});
