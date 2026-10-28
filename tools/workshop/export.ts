// Export a workshop's answers, readable, onto the operator's machine. The only place answers are
// ever opened (ADR 0003).
//
//   node tools/workshop/export.ts <slug> --key .secrets/<file>.private-key [--db <url>]
//
// --db defaults to the local development database (pglite://.secrets/local-db). For staging or
// production, pass the connection string from the vault, never from a chat.
// Output: .secrets/exports/<slug>-<day>.csv, gitignored. Pseudonyms are fresh per export (the
// hand-off package never carries the server's ids). The scrub pass is a separate step.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { slugLikeSchema } from '../../packages/contracts/src/index.ts';
import { openAnswer } from '../../packages/crypto/src/index.ts';
import { connect, events, participants, sessions, workshops } from '../../packages/db/src/index.ts';

const USAGE = 'usage: node tools/workshop/export.ts <slug> --key <private-key-file> [--db <url>]';
function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const slug = args.shift();
let keyFile: string | undefined;
let dbUrl = 'pglite://' + join(root, '.secrets/local-db');
while (args.length > 0) {
  const flag = args.shift();
  if (flag === '--key' && args.length > 0) keyFile = resolve(args.shift()!);
  else if (flag === '--db' && args.length > 0) dbUrl = args.shift()!;
  else fail(`unknown argument "${flag}"\n${USAGE}`, 2);
}
if (!slug || !slugLikeSchema.min(3).safeParse(slug).success || !keyFile) fail(USAGE, 2);
if (!existsSync(keyFile!)) fail(`no such key file: ${keyFile}`, 2);
const privateKey = readFileSync(keyFile!, 'utf8').trim();

const db = await connect(dbUrl);
const workshop = await db.query.workshops.findFirst({ where: eq(workshops.slug, slug!) });
if (!workshop) fail(`no workshop "${slug}" in this database`, 1);

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
  )
  .orderBy(participants.createdDay, participants.id, sessions.sessionNo, events.seq);

// Fresh pseudonyms per export: p01, p02... in order of first appearance. Nothing links them to the server's ids.
const pseudonyms = new Map<string, string>();
const pseudonym = (id: string) => {
  if (!pseudonyms.has(id)) pseudonyms.set(id, `p${String(pseudonyms.size + 1).padStart(3, '0')}`);
  return pseudonyms.get(id)!;
};

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

const outDir = join(root, '.secrets/exports');
mkdirSync(outDir, { recursive: true, mode: 0o700 });
const outFile = join(outDir, `${slug}-${new Date().toISOString().slice(0, 10)}.csv`);
writeFileSync(outFile, csv.join('\n') + '\n', { mode: 0o600 });

console.log(`workshop:      ${slug} (${workshop!.name})`);
console.log(`participants:  ${pseudonyms.size}`);
console.log(
  `events:        ${rows.length} (${opened} answers opened${failed ? `, ${failed} could not be opened` : ''})`,
);
console.log(`written to:    ${outFile}`);
process.exit(0);
