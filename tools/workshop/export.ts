// Export a workshop's answers, readable, onto the operator's machine. The only place answers are
// ever opened (ADR 0003).
//
//   node tools/workshop/export.ts <slug> --key .secrets/<file>.private-key [--db <url>] [--out <dir>] [--overwrite]
//
// --db defaults to the local development database (pglite://.secrets/local-db). For staging or
// production, pass the connection string from the vault, never from a chat.
// --out defaults to .secrets/exports, gitignored. The file is <slug>-<day>.csv, created
// exclusively: a file already there is refused unless --overwrite says so, so a second run on the
// same day can never replace an export silently.
// The key is checked against the workshop before any row is read: a key that does not open an
// envelope sealed to the workshop's public key is refused with its crypto code, and nothing is
// written. Pseudonyms are fresh per export, in a random order, so two exports of the same workshop
// cannot be lined up by them and the hand-off package never carries the server's ids. The scrub
// pass is a separate step (architecture plan, section 14).

import { existsSync, mkdirSync, chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { slugLikeSchema } from '../../packages/contracts/src/index.ts';
import { openAnswer, sealAnswer } from '../../packages/crypto/src/index.ts';
import { connect } from '../../packages/db/src/connect.ts';
import { events, participants, sessions, workshops } from '../../packages/db/src/index.ts';

const USAGE =
  'usage: node tools/workshop/export.ts <slug> --key <private-key-file> [--db <url>] [--out <dir>] [--overwrite]';
function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

// ---- arguments: anything unexpected is an error, so a typo cannot change what the tool does ----

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const slug = args.shift();
let keyFile: string | undefined;
let dbUrl = 'pglite://' + join(root, '.secrets/local-db');
let outDir = join(root, '.secrets/exports');
let overwrite = false;
while (args.length > 0) {
  const flag = args.shift();
  if (flag === '--key' && args.length > 0) keyFile = resolve(args.shift()!);
  else if (flag === '--db' && args.length > 0) dbUrl = args.shift()!;
  else if (flag === '--out' && args.length > 0) outDir = resolve(args.shift()!);
  else if (flag === '--overwrite') overwrite = true;
  else fail(`unknown argument "${flag}"\n${USAGE}`, 2);
}
if (!slug || !slugLikeSchema.min(3).safeParse(slug).success || !keyFile) fail(USAGE, 2);
if (!existsSync(keyFile!)) fail(`no such key file: ${keyFile}`, 2);
const privateKey = readFileSync(keyFile!, 'utf8').trim();

const db = await connect(dbUrl);
const workshop = await db.query.workshops.findFirst({ where: eq(workshops.slug, slug!) });
if (!workshop) fail(`no workshop "${slug}" in this database`, 1);

// ---- the key must be this workshop's, proved before any row is read ----
// An envelope sealed to the workshop's public key must open with the key given. A malformed key
// fails with CRYPTO_BAD_PRIVATE_KEY, another workshop's key with CRYPTO_OPEN_FAILED; either way
// the export stops here and writes nothing. The codes are in the runbook.
try {
  openAnswer(privateKey, sealAnswer(workshop!.publicKey, 'key check'));
} catch (error) {
  const code = (error as { code?: string }).code ?? 'unknown';
  if (code === 'CRYPTO_BAD_PRIVATE_KEY') {
    fail(
      `${code}: the key file does not hold a 32-byte key in base64; copy it again from the vault`,
      1,
    );
  }
  fail(
    `${code}: this key does not open answers sealed to ${slug} (workshop key ${workshop!.keyFingerprint}); compare the fingerprint with workshop.json`,
    1,
  );
}

const rows = await db
  .select({
    participantId: participants.id,
    createdDay: participants.createdDay,
    wave: participants.wave,
    sessionNo: sessions.sessionNo,
    startedDay: sessions.startedDay,
    seq: events.seq,
    cardId: events.cardId,
    kind: events.kind,
    body: events.body,
    eventDay: events.createdDay,
    deckVersion: events.deckVersion,
  })
  .from(events)
  .innerJoin(sessions, eq(events.sessionId, sessions.id))
  .innerJoin(
    participants,
    and(eq(sessions.participantId, participants.id), eq(participants.workshopId, workshop!.id)),
  );

// Fresh pseudonyms per export: p001, p002... handed out in a random order, so neither the server's
// ids nor the order of joining can be read back from them, and two exports do not line up.
const ids = [...new Set(rows.map((r) => r.participantId))];
for (let i = ids.length - 1; i > 0; i--) {
  const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
}
const pseudonyms = new Map(ids.map((id, i) => [id, `p${String(i + 1).padStart(3, '0')}`]));
const pseudonym = (id: string) => pseudonyms.get(id)!;
rows.sort(
  (a, b) =>
    pseudonym(a.participantId).localeCompare(pseudonym(b.participantId)) ||
    a.sessionNo - b.sessionNo ||
    a.seq - b.seq,
);

let opened = 0;
let failed = 0;
const csv = [
  [
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
  ].join(','),
];
for (const r of rows) {
  let answer = '';
  if (r.kind === 'answered' && r.body) {
    try {
      answer = openAnswer(privateKey, r.body);
      opened++;
    } catch (error) {
      // A bad row is reported, not fatal: the export continues and the count is printed.
      answer = `[could not open: ${(error as { code?: string }).code ?? 'unknown'}]`;
      failed++;
    }
  }
  csv.push(
    [
      pseudonym(r.participantId),
      r.createdDay,
      r.wave ?? 'invite',
      r.sessionNo,
      r.startedDay,
      r.seq,
      r.cardId,
      r.kind,
      r.eventDay,
      r.deckVersion,
      answer,
    ]
      .map((v) => `"${String(v).replaceAll('"', '""')}"`)
      .join(','),
  );
}

// ---- the file: created exclusively, readable by the owner alone ----

mkdirSync(outDir, { recursive: true, mode: 0o700 });
chmodSync(outDir, 0o700); // mkdir's mode applies only when it creates the directory
const outFile = join(outDir, `${slug}-${new Date().toISOString().slice(0, 10)}.csv`);
// With --overwrite the old file is removed first and the write stays exclusive: a symlink planted
// at that path is removed, never followed.
if (overwrite) rmSync(outFile, { force: true });
try {
  // 'wx' is O_CREAT | O_EXCL: create the file, fail if anything already exists at that path.
  writeFileSync(outFile, csv.join('\n') + '\n', { mode: 0o600, flag: 'wx' });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
    fail(
      `refusing to overwrite ${outFile}; pass --overwrite if you mean to replace today's export`,
      1,
    );
  }
  throw error;
}
chmodSync(outFile, 0o600);

console.log(`workshop:      ${slug} (${workshop!.name})`);
console.log(`participants:  ${pseudonyms.size}`);
console.log(
  `events:        ${rows.length} (${opened} answers opened${failed ? `, ${failed} could not be opened` : ''})`,
);
console.log(`written to:    ${outFile}`);
process.exit(0);
