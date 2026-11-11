// The operator's status command: one workshop's numbers in plain text, counts and days only
// (design plan, section 6, "A status command"). The first thing to run when something feels off,
// and the thing to read the evening the newsletter goes out.
//
//   npm run workshop:status -- <slug> [--days <n>] [--debug]
//   node tools/workshop/status.ts <slug> [--days <n>] [--debug]      DATABASE_URL from the environment
//
// The database address comes from the DATABASE_URL environment variable and nowhere else. It is
// never a flag, so it cannot reach shell history through the command line, and it is never
// printed, not even inside an error. docs/runbook.md, "Watching a workshop", says how to set it
// from the vault for staging and for production.
//
// Read-only. Every statement here is a select: no insert, no update, no delete. Against Neon
// (a postgres:// address) the tool sends those selects and nothing else. A pglite:// address is
// different: connect() applies the migrations to that local folder before the first select, which
// is a write. pglite:// is for the development database and the tests, never for Neon.
// tools/workshop/test/status.test.ts reads this file and fails if a write statement appears in
// it. That test is a tripwire, not a proof: it catches a write added here, not one hidden behind
// a function this file imports. What keeps the tool read-only is that it calls only selects and
// findWorkshop, and, for production, the read-only role the runbook recommends.
//
// When the database fails, the tool prints one fixed line saying which step failed, with the
// error's class and code, and never the driver's message, which can quote the query or the
// address. --debug adds the message, with the address and its password taken out.
//
// What it prints is counts and days. No code, no code hash, no participant id, no session id, no
// card text, and no time finer than a day: the backup's time is cut to its day inside the query,
// so a finer time never reaches this process. Every query on participant data filters on the
// workshop's id, directly or through the participant a row belongs to. backup_runs carries no
// workshop; it is read for this database's own run and this workshop's, never another one's.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { EVENT_KINDS, slugLikeSchema } from '../../packages/contracts/src/index.ts';
import { connect } from '../../packages/db/src/connect.ts';
import {
  backupRuns,
  events,
  findWorkshop,
  invites,
  participants,
  sessions,
  waves,
  type Db,
} from '../../packages/db/src/index.ts';

export const DEFAULT_DAYS = 7;
const MAX_DAYS = 366;
const USAGE =
  'usage: npm run workshop:status -- <slug> [--days <n>] [--debug]   (DATABASE_URL from the environment)';

type DayCount = { day: string; n: number };
type BackupDays = { newestOk: string | null; newestFailed: string | null };

export type WorkshopStatusReport = {
  slug: string;
  name: string;
  status: string;
  opensDay: string;
  closesDay: string;
  today: string;
  days: number;
  waves: {
    wave: string;
    label: string;
    opened: number;
    joined: number;
    stillIn: number;
    cap: number;
  }[];
  participants: { all: number; throughWave: number; throughInvite: number };
  joinedPerDay: DayCount[];
  sessions: number;
  events: { all: number; byKind: { kind: string; n: number }[] };
  answersPerDay: DayCount[];
  answering: { participants: number; median: number; largest: number };
  invites: { created: number; spent: number };
  backups: { database: BackupDays; workshop: BackupDays };
};

// ---- days: YYYY-MM-DD strings, counted in UTC as the API counts them (apps/api/src/app.ts) ----

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b; negative when b is before a. */
function daysFrom(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Every day of the window, oldest first, with 0 where nothing happened, so a quiet day shows as a
 * quiet day and not as a gap. A day after today (a device whose clock runs ahead; event days are
 * the device's) is kept at the end rather than dropped.
 */
function perDay(rows: { day: string; n: number }[], today: string, days: number): DayCount[] {
  const counts = new Map(rows.map((r) => [r.day, r.n]));
  const out: DayCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    out.push({ day, n: counts.get(day) ?? 0 });
  }
  for (const r of [...rows].sort((a, b) => a.day.localeCompare(b.day))) {
    if (r.day > today) out.push({ day: r.day, n: r.n });
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// ---- the numbers ----

/**
 * Reads one workshop's numbers. Returns undefined when no workshop has this slug. Selects only:
 * counts, days and the workshop's own settings, never a row about a participant.
 */
export async function readStatus(
  db: Db,
  slug: string,
  options: { today: string; days: number },
): Promise<WorkshopStatusReport | undefined> {
  const workshop = await findWorkshop(db, slug);
  if (!workshop) return undefined;
  const wid = workshop.id;
  const { today, days } = options;
  const from = addDays(today, -(days - 1));
  const ofWorkshop = eq(participants.workshopId, wid);

  const waveRows = await db
    .select({
      wave: waves.wave,
      label: waves.label,
      opened: waves.openedCount,
      joined: waves.joinedCount,
    })
    .from(waves)
    .where(eq(waves.workshopId, wid))
    .orderBy(waves.wave);

  // Participants still in, by the wave they came through (null: an invite): rows still present,
  // not recent activity. Lower than a wave's joined counter when someone has used "delete me": the
  // counter counts joins, the rows count who has not left.
  const hereRows = await db
    .select({ wave: participants.wave, n: count() })
    .from(participants)
    .where(ofWorkshop)
    .groupBy(participants.wave);
  const here = new Map(hereRows.map((r) => [r.wave, r.n]));
  const all = hereRows.reduce((sum, r) => sum + r.n, 0);
  const throughInvite = here.get(null) ?? 0;

  const joinedRows = await db
    .select({ day: participants.createdDay, n: count() })
    .from(participants)
    .where(and(ofWorkshop, gte(participants.createdDay, from)))
    .groupBy(participants.createdDay);

  const [sessionRow] = await db
    .select({ n: count() })
    .from(sessions)
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .where(ofWorkshop);

  const kindRows = await db
    .select({ kind: events.kind, n: count() })
    .from(events)
    .innerJoin(sessions, eq(events.sessionId, sessions.id))
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .where(ofWorkshop)
    .groupBy(events.kind);
  const byKindMap = new Map(kindRows.map((r) => [r.kind, r.n]));
  // Every kind the contracts know, in their order, zeros included; then any other kind found, so
  // a kind added later still shows up here before this file learns its name.
  const known: readonly string[] = EVENT_KINDS;
  const byKind = [
    ...known.map((kind) => ({ kind, n: byKindMap.get(kind) ?? 0 })),
    ...kindRows
      .filter((r) => !known.includes(r.kind))
      .sort((a, b) => a.kind.localeCompare(b.kind))
      .map((r) => ({ kind: r.kind, n: r.n })),
  ];

  const answerDayRows = await db
    .select({ day: events.createdDay, n: count() })
    .from(events)
    .innerJoin(sessions, eq(events.sessionId, sessions.id))
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .where(and(ofWorkshop, eq(events.kind, 'answered'), gte(events.createdDay, from)))
    .groupBy(events.createdDay);

  // One number per participant who answered at least once, grouped in the database. The id is a
  // grouping key only; it is never selected, so it never reaches this process.
  const perParticipant = await db
    .select({ n: count() })
    .from(events)
    .innerJoin(sessions, eq(events.sessionId, sessions.id))
    .innerJoin(participants, eq(sessions.participantId, participants.id))
    .where(and(ofWorkshop, eq(events.kind, 'answered')))
    .groupBy(participants.id);
  const answerCounts = perParticipant.map((r) => r.n);

  const inviteRows = await db
    .select({ used: invites.used, n: count() })
    .from(invites)
    .where(eq(invites.workshopId, wid))
    .groupBy(invites.used);
  const spent = inviteRows.find((r) => r.used)?.n ?? 0;
  const created = inviteRows.reduce((sum, r) => sum + r.n, 0);

  // The day of the newest run, cut to a day in the database: the timestamp itself is never read.
  const workshopKind = `workshop:${slug}`;
  const backupRows = await db
    .select({
      kind: backupRuns.kind,
      ok: backupRuns.ok,
      day: sql<string>`to_char(max(${backupRuns.finishedAt}) at time zone 'UTC', 'YYYY-MM-DD')`,
    })
    .from(backupRuns)
    .where(inArray(backupRuns.kind, ['database', workshopKind]))
    .groupBy(backupRuns.kind, backupRuns.ok);
  const backupDays = (kind: string): BackupDays => ({
    newestOk: backupRows.find((r) => r.kind === kind && r.ok)?.day ?? null,
    newestFailed: backupRows.find((r) => r.kind === kind && !r.ok)?.day ?? null,
  });

  return {
    slug: workshop.slug,
    name: workshop.name,
    status: workshop.status,
    opensDay: workshop.opensDay,
    closesDay: workshop.closesDay,
    today,
    days,
    waves: waveRows.map((w) => ({ ...w, stillIn: here.get(w.wave) ?? 0, cap: workshop.cap })),
    participants: { all, throughWave: all - throughInvite, throughInvite },
    joinedPerDay: perDay(joinedRows, today, days),
    sessions: sessionRow?.n ?? 0,
    events: { all: kindRows.reduce((sum, r) => sum + r.n, 0), byKind },
    answersPerDay: perDay(answerDayRows, today, days),
    answering: {
      participants: answerCounts.length,
      median: median(answerCounts),
      largest: answerCounts.length === 0 ? 0 : Math.max(...answerCounts),
    },
    invites: { created, spent },
    backups: { database: backupDays('database'), workshop: backupDays(workshopKind) },
  };
}

// ---- the text ----

function ago(day: string, today: string): string {
  const n = daysFrom(day, today);
  if (n === 0) return 'today';
  if (n === 1) return '1 day before today';
  if (n > 1) return `${n} days before today`;
  return `${-n} day${n === -1 ? '' : 's'} after today`;
}

function backupLine(label: string, b: BackupDays, today: string): string {
  const ok = b.newestOk ? `newest ${b.newestOk}, ${ago(b.newestOk, today)}` : 'none recorded';
  const failed =
    b.newestFailed && (!b.newestOk || b.newestFailed > b.newestOk)
      ? `; a failed run on ${b.newestFailed}`
      : '';
  return `${label}: ${ok}${failed}`;
}

function windowLine(r: WorkshopStatusReport): string {
  const length = daysFrom(r.opensDay, r.closesDay) + 1;
  const day = daysFrom(r.opensDay, r.today) + 1;
  if (day < 1) return `opens in ${1 - day} day${day === 0 ? '' : 's'}`;
  if (day > length) {
    const after = day - length;
    return `the window closed ${after} day${after === 1 ? '' : 's'} ago`;
  }
  return `day ${day} of ${length}`;
}

export function formatStatus(r: WorkshopStatusReport): string {
  const num = (n: number, width: number) => String(n).padStart(width);
  const days = (rows: DayCount[]) => rows.map((d) => `  ${d.day}  ${num(d.n, 5)}`);
  const m = Number.isInteger(r.answering.median)
    ? String(r.answering.median)
    : r.answering.median.toFixed(1);
  const waveWidth = Math.max(4, ...r.waves.map((w) => w.wave.length));
  const lines = [
    `workshop      ${r.slug} (${r.name}), status ${r.status}`,
    `days          opens ${r.opensDay}, closes ${r.closesDay}; today ${r.today} (UTC), ${windowLine(r)}`,
    '',
    `waves         ${'wave'.padEnd(waveWidth)}  opened  joined  still in    cap`,
    ...(r.waves.length === 0
      ? ['              none']
      : r.waves.map(
          (w) =>
            `              ${w.wave.padEnd(waveWidth)}  ${num(w.opened, 6)}  ${num(w.joined, 6)}  ${num(w.stillIn, 8)}  ${num(w.cap, 5)}   ${w.label}`,
        )),
    '',
    `participants  ${r.participants.all}: ${r.participants.throughWave} through a wave, ${r.participants.throughInvite} through an invite`,
    `joined per day, last ${r.days} days, participants still in (delete-me removes a row; the wave's joined counter keeps it)`,
    ...days(r.joinedPerDay),
    '',
    `sessions      ${r.sessions}`,
    `events        ${r.events.all}`,
    ...r.events.byKind.map((k) => `  ${k.kind.padEnd(12)}${num(k.n, 6)}`),
    `answers per day, last ${r.days} days`,
    ...days(r.answersPerDay),
    `answering     ${r.answering.participants} participants with at least one answer; answers per participant among them: median ${m}, largest ${r.answering.largest}`,
    '',
    `invites       ${r.invites.created} created, ${r.invites.spent} spent`,
    `backups       ${backupLine('database', r.backups.database, r.today)}`,
    `              ${backupLine(r.slug, r.backups.workshop, r.today)}`,
  ];
  return lines.join('\n');
}

// ---- the command ----

/**
 * An argument is echoed in an error only when it looks like a flag name. Anything else could be
 * a pasted secret (a connection string, a password), so it is described, never shown.
 */
function shown(arg: string): string {
  return /^--?[a-z][a-z-]{0,30}$/.test(arg) ? `"${arg}"` : '(not shown: it could be a secret)';
}

/**
 * The error's classes and code, when they are plain names; never a message. Drizzle wraps the
 * driver's error (DrizzleQueryError, whose message quotes the query and its parameters) and puts
 * the driver's own in `cause`, where the Postgres code is, so the chain is followed a few steps.
 */
function errorKind(error: unknown): string {
  const names: string[] = [];
  let code: string | undefined;
  let e: unknown = error;
  for (let depth = 0; depth < 4 && e !== undefined && e !== null; depth++) {
    // A class name, capitalised and at least three letters: a bundled driver's minified class
    // ("O") or a generic name ("error") says nothing and is left out.
    const name = [e?.constructor?.name ?? '', e instanceof Error ? e.name : ''].find((n) =>
      /^[A-Z][A-Za-z0-9]{2,40}$/.test(n),
    );
    if (name && !names.includes(name)) names.push(name);
    const c = (e as { code?: unknown }).code;
    if (!code && typeof c === 'string' && /^[A-Z0-9_]{1,40}$/.test(c)) code = c;
    e = e instanceof Error ? e.cause : undefined;
  }
  const parts = [...names, ...(code ? [code] : [])];
  return parts.length > 0 ? parts.join(', ') : 'unknown error';
}

/** The message of an error with the address and its password taken out. For --debug only. */
function redacted(message: string, url: string): string {
  let out = message.replaceAll(url, '[DATABASE_URL]');
  try {
    const password = new URL(url).password;
    if (password) out = out.replaceAll(password, '[password]');
  } catch {
    // Not a URL at all; the whole value was already replaced above.
  }
  return out;
}

export async function main(argv: string[], env: NodeJS.ProcessEnv, now: Date): Promise<number> {
  const usage = (line: string) => {
    console.error(`${line}\n${USAGE}`);
    return 2;
  };
  const args = [...argv];
  const slug = args.shift();
  let days = DEFAULT_DAYS;
  let debug = false;
  while (args.length > 0) {
    const flag = args.shift()!;
    if (flag === '--debug') debug = true;
    else if (flag === '--days' && args.length > 0) {
      const value = args.shift()!;
      if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > MAX_DAYS) {
        return usage(`--days takes a whole number from 1 to ${MAX_DAYS}`);
      }
      days = Number(value);
    } else return usage(`unknown argument ${shown(flag)}`);
  }
  if (!slug || !slugLikeSchema.min(3).safeParse(slug).success) {
    return usage(slug ? `not a workshop slug: ${shown(slug)}` : 'no workshop slug');
  }

  const url = env.DATABASE_URL;
  if (!url) {
    console.error(
      'DATABASE_URL is not set. Set it from the vault without typing it on the command line: docs/runbook.md, "Watching a workshop".',
    );
    return 2;
  }

  // Which step failed decides the plain words. For a postgres:// address, opening only checks the
  // address's shape; the first query is where the network, the password and the database answer.
  let step: 'open' | 'read' = 'open';
  try {
    const db = await connect(url);
    step = 'read';
    const report = await readStatus(db, slug, { today: now.toISOString().slice(0, 10), days });
    if (!report) {
      console.error(`no workshop "${slug}" in this database`);
      return 1;
    }
    console.log(formatStatus(report));
    return 0;
  } catch (error) {
    const what =
      step === 'open'
        ? 'could not open the database with this address: check its shape (postgresql://..., no quotes, nothing in front)'
        : 'the database did not answer the status queries: check the address is current and Neon is up';
    console.error(`${what} (${errorKind(error)}). --debug shows the driver's message.`);
    if (debug) {
      // The message of each error in the chain, outermost first: the driver's own is the last.
      let e: unknown = error;
      for (let depth = 0; depth < 4 && e !== undefined && e !== null; depth++) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`debug: ${redacted(message, url)}`);
        e = e instanceof Error ? e.cause : undefined;
      }
    }
    return 1;
  }
}

// Run only when started as a program, not when a test imports readStatus and formatStatus.
function startedAsProgram(): boolean {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (startedAsProgram()) process.exit(await main(process.argv.slice(2), process.env, new Date()));
