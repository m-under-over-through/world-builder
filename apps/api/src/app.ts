import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  AUTH_SCHEME,
  codeSchema,
  ERROR_CODES,
  inviteTokenSchema,
  joinRequestSchema,
  MAX_REQUEST_BYTES,
  normalizeCode,
  slugLikeSchema,
  SYNC_MAX_EVENTS,
  SYNC_MAX_SESSIONS,
  syncRequestSchema,
  type ErrorCode,
  type HealthResponse,
  type MeResponse,
} from '@wb/contracts';
import {
  createInvites,
  deleteParticipant,
  findParticipant,
  findWorkshop,
  healthReport,
  joinViaInvite,
  joinViaWave,
  participantData,
  participantSummary,
  pruneRateBuckets,
  rateLimitAllows,
  syncBatch,
  waveOpened,
  type Db,
  type Participant,
  type Workshop,
} from '@wb/db';
import { codeHash, newInviteToken, tokenHash } from './auth.ts';
import { BODY_TOO_LARGE, parseJsonBytes, readBodyBytes } from './body.ts';
import {
  consoleLogger,
  describeError,
  serverErrorLine,
  validationLine,
  type Logger,
} from './log.ts';

/**
 * The API (architecture plan, sections 6, 9 and 12; CLAUDE.md, API builder notes).
 *
 * - Every route is under /api/<slug>/ and resolves the workshop first; a missing workshop is 404.
 * - The code travels in `Authorization: Code <16 digits>`, never in a URL, and is stored hashed.
 * - Bodies are capped in bytes before parsing, then parsed with the strict contract schemas,
 *   and only the parsed value is used.
 * - Every failure path returns { error, message } with a code from ERROR_CODES. Unexpected
 *   errors get an errorId that matches the log line.
 * - A body that fails the contract writes one log line naming the route, the code and the field
 *   paths (log.ts); never a value, a body, a code or a hash.
 * - Rate limits without addresses: per code on authenticated routes, per workshop on the rest.
 * - This package never imports @wb/crypto: it stores sealed bodies it cannot read.
 */

export interface AppDeps {
  db: Db;
  pepper: string;
  version: string;
  now?: () => Date;
  /** Where log lines go; the console in deployment, an array in tests. */
  log?: Logger;
}

type Vars = { workshop: Workshop; participant: Participant };

/**
 * Requests allowed per minute, per bucket (ADR 0012). Join is budgeted per workshop at 120, decided
 * 2 November 2026 (docs/briefs/week-2-plan.md, section 4): a newsletter that lands at once sends
 * its readers to the consent screen within the same few minutes, and with 30 the thirty-first
 * would have seen an error. The cap of 150 per wave stays the bound on how many join at all; this
 * number only sets the pace. The client retries a refused join once, after Retry-After.
 */
const LIMITS = {
  health: 60,
  waveOpened: 120,
  join: 120,
  unknownCode: 30,
  authenticated: 60,
} as const;

/**
 * Every this many rate-limit checks, the instance deletes the buckets older than an hour, in one
 * statement, before answering the request (item 5 of the API brief; the nightly job prunes too, as
 * the backstop for instances that never reach the count). A bucket is one row per route, subject
 * and minute, so the table holds at most an hour of live buckets plus the rows written since the
 * last prune: about 60 rows per bucket that was busy all hour, plus a hundred.
 */
export const PRUNE_EVERY_CHECKS = 100;

export function todayDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function createApp(deps: AppDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? consoleLogger;
  const app = new Hono<{ Variables: Vars }>();

  /** Seconds until the minute turns and every bucket starts again: 1 to 60. */
  const secondsToNextMinute = () => 60 - Math.floor((now().getTime() / 1000) % 60);

  const fail = (c: Context, code: ErrorCode, errorId?: string) => {
    const { status, meaning } = ERROR_CODES[code];
    // A refused client is told how long the wait is (RFC 9110, Retry-After), so it can retry
    // once when the minute turns instead of guessing.
    const headers = code === 'RATE_LIMITED' ? { 'Retry-After': String(secondsToNextMinute()) } : {};
    return c.json(
      { error: code, message: meaning, ...(errorId ? { errorId } : {}) },
      status as 400,
      headers,
    );
  };

  let checksSincePrune = 0;
  const limited = async (route: string, subject: string, limitPerMinute: number) => {
    const allowed = await rateLimitAllows(deps.db, { route, subject, limitPerMinute, now: now() });
    if (++checksSincePrune >= PRUNE_EVERY_CHECKS) {
      checksSincePrune = 0;
      try {
        await pruneRateBuckets(deps.db, now());
      } catch (error) {
        // The request is answered either way; the nightly job prunes as the backstop.
        log.error(`rate_buckets prune failed: ${describeError(error)}`);
      }
    }
    return !allowed;
  };

  /**
   * Reads at most MAX_REQUEST_BYTES of the body, counted in bytes on the wire (body.ts), and
   * parses JSON; TOO_LARGE past the cap, undefined when the bytes are not JSON.
   */
  const readJson = async (c: Context): Promise<unknown | undefined> => {
    const bytes = await readBodyBytes(c.req.raw, MAX_REQUEST_BYTES);
    return bytes === BODY_TOO_LARGE ? TOO_LARGE : parseJsonBytes(bytes);
  };
  const TOO_LARGE = BODY_TOO_LARGE;

  /** The route as written in ROUTES, "POST /api/:slug/join", so the line never carries a slug or a wave. */
  const routeOf = (c: Context) => `${c.req.method} ${c.req.routePath}`;

  app.onError((error, c) => {
    const errorId = crypto.randomUUID().slice(0, 8);
    // The stack is logged, the body never is, and a failed query's parameters are cut out
    // (log.ts). Netlify keeps function logs for about a day.
    log.error(serverErrorLine(errorId, error));
    return fail(c, 'SERVER_ERROR', errorId);
  });

  app.get('/api/health', async (c) => {
    let dbReachable = true;
    let report: Awaited<ReturnType<typeof healthReport>> = {
      lastBackupAt: null,
      eventsToday: 0,
      workshops: [],
    };
    // The limiter needs the database too, so it sits inside the same guard: a database that
    // cannot be reached must answer 503 with ok false (what the monitor and the runbook expect),
    // never a 500 from the limiter failing first.
    try {
      if (await limited('health', 'global', LIMITS.health)) return fail(c, 'RATE_LIMITED');
      report = await healthReport(deps.db, todayDay(now()));
    } catch {
      dbReachable = false;
    }
    const body: HealthResponse = { ok: dbReachable, version: deps.version, dbReachable, ...report };
    return c.json(body, dbReachable ? 200 : 503);
  });

  // ---- everything below is scoped to a workshop ----

  const workshopRoutes = new Hono<{ Variables: Vars }>();

  workshopRoutes.use('*', async (c, next) => {
    const slug = c.req.param('slug') ?? '';
    if (!slugLikeSchema.safeParse(slug).success) return fail(c, 'WORKSHOP_UNKNOWN');
    const workshop = await findWorkshop(deps.db, slug);
    if (!workshop) return fail(c, 'WORKSHOP_UNKNOWN');
    c.set('workshop', workshop);
    await next();
  });

  /** Accepting answers: status open, and today inside the open window. */
  const isOpen = (w: Workshop) => {
    const today = todayDay(now());
    return w.status === 'open' && today >= w.opensDay && today <= w.closesDay;
  };

  /** Authenticated routes: the code header, the hash, the lookup, the per-code limit. */
  const authenticated = async (c: Context<{ Variables: Vars }>, next: () => Promise<void>) => {
    const workshop = c.get('workshop');
    const header = c.req.header('authorization') ?? '';
    const [scheme, ...rest] = header.split(' ');
    const code = normalizeCode(rest.join(''));
    if (scheme !== AUTH_SCHEME || !codeSchema.safeParse(code).success)
      return fail(c, 'AUTH_CODE_MISSING');
    const hash = await codeHash(deps.pepper, workshop.slug, code);
    if (await limited('auth', hash, LIMITS.authenticated)) return fail(c, 'RATE_LIMITED');
    const participant = await findParticipant(deps.db, workshop.id, hash);
    if (!participant) {
      if (await limited('unknown-code', workshop.id, LIMITS.unknownCode))
        return fail(c, 'RATE_LIMITED');
      return fail(c, 'AUTH_CODE_UNKNOWN');
    }
    c.set('participant', participant);
    await next();
  };

  workshopRoutes.post('/waves/:wave/opened', async (c) => {
    const workshop = c.get('workshop');
    if (await limited('wave-opened', workshop.id, LIMITS.waveOpened))
      return fail(c, 'RATE_LIMITED');
    if (!isOpen(workshop)) return fail(c, 'WORKSHOP_CLOSED');
    const wave = c.req.param('wave') ?? '';
    if (
      !slugLikeSchema.safeParse(wave).success ||
      !(await waveOpened(deps.db, workshop.id, wave))
    ) {
      return fail(c, 'JOIN_WAVE_UNKNOWN');
    }
    return c.json({ ok: true });
  });

  workshopRoutes.post('/join', async (c) => {
    const workshop = c.get('workshop');
    if (await limited('join', workshop.id, LIMITS.join)) return fail(c, 'RATE_LIMITED');
    if (!isOpen(workshop)) return fail(c, 'WORKSHOP_CLOSED');
    const raw = await readJson(c);
    if (raw === TOO_LARGE) return fail(c, 'REQUEST_TOO_LARGE');
    const parsed = joinRequestSchema.safeParse(raw);
    if (!parsed.success) {
      log.warn(
        validationLine(
          'REQUEST_INVALID',
          routeOf(c),
          raw === undefined ? 'not json' : parsed.error.issues,
        ),
      );
      return fail(c, 'REQUEST_INVALID');
    }
    const { code, wave, invite } = parsed.data;
    const hash = await codeHash(deps.pepper, workshop.slug, code);
    const today = todayDay(now());
    const result = wave
      ? await joinViaWave(deps.db, { workshop, wave, codeHash: hash, today })
      : await joinViaInvite(deps.db, {
          workshop,
          tokenHash: await tokenHash(invite!),
          codeHash: hash,
          today,
        });
    if (!result.ok) {
      const code: Record<typeof result.reason, ErrorCode> = {
        wave_unknown: 'JOIN_WAVE_UNKNOWN',
        wave_full: 'JOIN_WAVE_FULL',
        invite_invalid: 'JOIN_INVITE_INVALID',
        invite_used: 'JOIN_INVITE_USED',
        code_taken: 'JOIN_CODE_TAKEN',
      };
      return fail(c, code[result.reason]);
    }
    return c.json({ ok: true, participant: await participantSummary(deps.db, result.participant) });
  });

  workshopRoutes.post('/sync', authenticated, async (c) => {
    const workshop = c.get('workshop');
    if (!isOpen(workshop)) return fail(c, 'WORKSHOP_CLOSED');
    const raw = await readJson(c);
    if (raw === TOO_LARGE) return fail(c, 'REQUEST_TOO_LARGE');
    if (typeof raw === 'object' && raw !== null) {
      const r = raw as { sessions?: unknown; events?: unknown };
      if (
        (Array.isArray(r.sessions) && r.sessions.length > SYNC_MAX_SESSIONS) ||
        (Array.isArray(r.events) && r.events.length > SYNC_MAX_EVENTS)
      ) {
        return fail(c, 'SYNC_BATCH_TOO_LARGE');
      }
    }
    const parsed = syncRequestSchema.safeParse(raw);
    if (!parsed.success) {
      log.warn(
        validationLine(
          'SYNC_PAYLOAD_INVALID',
          routeOf(c),
          raw === undefined ? 'not json' : parsed.error.issues,
        ),
      );
      return fail(c, 'SYNC_PAYLOAD_INVALID');
    }
    return c.json(await syncBatch(deps.db, c.get('participant').id, parsed.data));
  });

  // Past the close day the app shows a closing screen (screen map: WORKSHOP_CLOSED); seeing and
  // deleting one's rows ends with collection, as the trust page says (architecture plan, 13).
  workshopRoutes.get('/me', authenticated, async (c) => {
    const workshop = c.get('workshop');
    if (!isOpen(workshop)) return fail(c, 'WORKSHOP_CLOSED');
    const participant = c.get('participant');
    const data = await participantData(deps.db, participant.id);
    const body: MeResponse = {
      workshop: {
        slug: workshop.slug,
        name: workshop.name,
        closesDay: workshop.closesDay,
        deleteDay: workshop.deleteDay,
      },
      participant: await participantSummary(deps.db, participant),
      ...data,
    };
    return c.json(body);
  });

  workshopRoutes.post('/invites', authenticated, async (c) => {
    const workshop = c.get('workshop');
    if (!isOpen(workshop)) return fail(c, 'WORKSHOP_CLOSED');
    const participant = c.get('participant');
    const token = newInviteToken();
    if (!inviteTokenSchema.safeParse(token).success)
      throw new Error('invite token generator broke its own contract');
    const created = await createInvites(deps.db, participant, [await tokenHash(token)]);
    if (created === 0) return fail(c, 'INVITES_EXHAUSTED');
    return c.json({ tokens: [token], invitesLeft: participant.invitesLeft - 1 });
  });

  workshopRoutes.delete('/me', authenticated, async (c) => {
    const workshop = c.get('workshop');
    if (!isOpen(workshop)) return fail(c, 'WORKSHOP_CLOSED');
    await deleteParticipant(deps.db, c.get('participant').id);
    return c.json({ ok: true });
  });

  app.route('/api/:slug', workshopRoutes);

  app.notFound((c) => fail(c, 'WORKSHOP_UNKNOWN'));

  return app;
}

export type App = ReturnType<typeof createApp>;
