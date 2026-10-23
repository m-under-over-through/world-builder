import { z } from 'zod';
import { codeSchema } from './code.ts';
import { eventSchema } from './events.ts';
import { daySchema, slugLikeSchema, uuidSchema } from './primitives.ts';
import { sessionSchema } from './session.ts';
import { WORKSHOP_STATUSES } from './workshop.ts';

/**
 * The API, as seen from both sides.
 *
 * Every route lives under the workshop slug. The client is served at /<slug>/ and calls
 * /api/<slug>/... on the same origin, so the Content Security Policy can say "talk to self only"
 * (docs/adr/0008-routes-on-one-origin.md).
 *
 * Authentication is the anonymous code in a header: `Authorization: Code 1234567890123456`.
 * The code never appears in a URL.
 */
export const AUTH_SCHEME = 'Code';

export const ROUTES = {
  /** No auth. Counts an opened wave link. Called by the join page when it loads. */
  waveOpened: { method: 'POST', path: '/api/:slug/waves/:wave/opened' },
  /** No auth. Creates the participant for a new code, through a wave or an invite. */
  join: { method: 'POST', path: '/api/:slug/join' },
  /** Stores sessions and events; safe to retry. */
  sync: { method: 'POST', path: '/api/:slug/sync' },
  /** Everything the server holds about this code. Also how a second device continues. */
  me: { method: 'GET', path: '/api/:slug/me' },
  /** Creates invite tokens, up to the workshop's allowance. */
  invites: { method: 'POST', path: '/api/:slug/invites' },
  /** Deletes everything about this code. */
  deleteMe: { method: 'DELETE', path: '/api/:slug/me' },
  /** No auth. Version, database, last backup, activity. What the monitor watches. */
  health: { method: 'GET', path: '/api/health' },
} as const;

/**
 * Error codes. Each one is a heading in docs/runbook.md. The server returns the code; the client
 * shows it in the diagnostics view; a participant can read it out and you can look it up.
 */
export const ERROR_CODES = {
  WORKSHOP_UNKNOWN: { status: 404, meaning: 'No workshop with this slug.' },
  WORKSHOP_CLOSED: {
    status: 403,
    meaning: 'The workshop is past its close day; it no longer accepts joins or events.',
  },
  JOIN_WAVE_UNKNOWN: {
    status: 404,
    meaning: 'The wave in the link does not exist for this workshop.',
  },
  JOIN_WAVE_CLOSED: { status: 403, meaning: 'The wave link is outside its open window.' },
  JOIN_WAVE_FULL: { status: 403, meaning: 'The wave has reached its cap.' },
  JOIN_INVITE_INVALID: { status: 404, meaning: 'The invite token is unknown.' },
  JOIN_INVITE_USED: { status: 403, meaning: 'The invite token was already used.' },
  JOIN_CODE_TAKEN: {
    status: 409,
    meaning:
      'A participant with this code exists. Astronomically unlikely; the client generates a new code and retries once.',
  },
  AUTH_CODE_MISSING: {
    status: 401,
    meaning: 'No Authorization header, or not of the form "Code <16 digits>".',
  },
  AUTH_CODE_UNKNOWN: {
    status: 401,
    meaning:
      'The code is well-formed but no participant has it. The client shows the welcome screen.',
  },
  SYNC_PAYLOAD_INVALID: {
    status: 400,
    meaning: 'A session or event in the batch failed validation; nothing in the batch was stored.',
  },
  SYNC_BATCH_TOO_LARGE: {
    status: 413,
    meaning: 'More sessions or events than one sync call allows.',
  },
  INVITES_EXHAUSTED: { status: 403, meaning: 'The participant has no invites left.' },
  RATE_LIMITED: {
    status: 429,
    meaning: 'Too many requests for this code or this route; the client waits and retries.',
  },
  SERVER_ERROR: {
    status: 500,
    meaning: 'Unexpected failure. The response carries an errorId that matches a server log line.',
  },
} as const;
export type ErrorCode = keyof typeof ERROR_CODES;
export const errorCodeSchema = z.enum(Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);

/** Failures that happen on the device and never reach the server. Shown in the diagnostics view. */
export const CLIENT_ERROR_CODES = {
  CLIENT_STORAGE_UNAVAILABLE:
    'The browser refused IndexedDB or localStorage; the code cannot be kept between visits.',
  CLIENT_SEAL_FAILED: 'Encrypting an answer failed; nothing was stored or sent.',
  CLIENT_SYNC_FAILED:
    'The last sync attempt failed; events wait in the outbox and the app retries.',
} as const;
export type ClientErrorCode = keyof typeof CLIENT_ERROR_CODES;

export const errorResponseSchema = z.object({
  error: errorCodeSchema,
  message: z.string(),
  /** Only on SERVER_ERROR: an opaque id to find the log line. Never contains data. */
  errorId: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** 16 random bytes in base64url: 22 characters, no padding. Appears in /<slug>/join/i/<token>. */
export const inviteTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}$/, 'expected 22 base64url characters');

export const participantSummarySchema = z.object({
  createdDay: daySchema,
  invitesLeft: z.number().int().min(0),
  /** The wave this participant came through, or null for an invite. Never who invited them. */
  wave: slugLikeSchema.nullable(),
  sessionsCount: z.number().int().min(0),
});
export type ParticipantSummary = z.infer<typeof participantSummarySchema>;

export const joinRequestSchema = z
  .object({
    code: codeSchema,
    wave: slugLikeSchema.optional(),
    invite: inviteTokenSchema.optional(),
  })
  .superRefine((req, ctx) => {
    const ways = [req.wave, req.invite].filter((v) => v !== undefined).length;
    if (ways !== 1) {
      ctx.addIssue({ code: 'custom', message: 'exactly one of wave or invite is required' });
    }
  });
export type JoinRequest = z.infer<typeof joinRequestSchema>;

export const joinResponseSchema = z.object({
  ok: z.literal(true),
  participant: participantSummarySchema,
});

export const SYNC_MAX_SESSIONS = 20;
export const SYNC_MAX_EVENTS = 200;

export const syncRequestSchema = z.object({
  sessions: z.array(sessionSchema).max(SYNC_MAX_SESSIONS),
  events: z.array(eventSchema).max(SYNC_MAX_EVENTS),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export const syncResponseSchema = z.object({
  acceptedSessionIds: z.array(uuidSchema),
  acceptedEventIds: z.array(uuidSchema),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;

export const meResponseSchema = z.object({
  workshop: z.object({
    slug: slugLikeSchema,
    name: z.string(),
    closesDay: daySchema,
    deleteDay: daySchema,
  }),
  participant: participantSummarySchema,
  sessions: z.array(sessionSchema),
  /** Full rows, sealed bodies included. This is "what we store about you", shown as is. */
  events: z.array(eventSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const invitesResponseSchema = z.object({
  tokens: z.array(inviteTokenSchema),
  invitesLeft: z.number().int().min(0),
});

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  dbReachable: z.boolean(),
  /** ISO timestamp written by the backup job, or null if it has never run. Stale means the backups stopped. */
  lastBackupAt: z.string().nullable(),
  eventsToday: z.number().int().min(0),
  workshops: z.array(
    z.object({
      slug: slugLikeSchema,
      status: z.enum(WORKSHOP_STATUSES),
      participants: z.number().int().min(0),
      eventsToday: z.number().int().min(0),
    }),
  ),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
