import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The schema, as in the architecture plan, section 9, with the review's additions.
 *
 * Rules that hold on every table (CLAUDE.md, non-negotiables):
 * - No column can hold a name, an email, an address, a user agent or a precise time about a
 *   participant. Participant time is a calendar day. (backup_runs and rate_buckets record times
 *   about the system, not about people.)
 * - Every table with participant data carries a workshop id, directly or through its parent, and
 *   every query filters on it. packages/db/test/scoping.test.ts proves it.
 * - events are append-only. No update statement touches them anywhere in the codebase.
 */

export const workshops = pgTable('workshops', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'), // WORKSHOP_STATUSES in contracts
  publicKey: text('public_key').notNull(),
  keyFingerprint: text('key_fingerprint').notNull(),
  deckVersion: text('deck_version').notNull(),
  warmupsPerSession: integer('warmups_per_session').notNull(),
  checkpointsPerSession: integer('checkpoints_per_session').notNull(),
  invitesPerParticipant: integer('invites_per_participant').notNull(),
  cap: integer('cap').notNull(),
  opensDay: date('opens_day', { mode: 'string' }).notNull(),
  closesDay: date('closes_day', { mode: 'string' }).notNull(),
  deleteDay: date('delete_day', { mode: 'string' }).notNull(),
});

export const waves = pgTable(
  'waves',
  {
    workshopId: uuid('workshop_id')
      .notNull()
      .references(() => workshops.id, { onDelete: 'cascade' }),
    /** The wave id in the link: /<slug>/join/<wave>. */
    wave: text('wave').notNull(),
    label: text('label').notNull(),
    /**
     * Devices that opened the wave link. The client counts once per device, the first time the
     * device arrives through this wave, with no cookie and no address: a reload does not count
     * again, a cleared browser or a second device does. Approximate by design (ADR 0006).
     */
    openedCount: integer('opened_count').notNull().default(0),
    joinedCount: integer('joined_count').notNull().default(0),
  },
  (t) => [uniqueIndex('waves_workshop_wave').on(t.workshopId, t.wave)],
);

export const participants = pgTable(
  'participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workshopId: uuid('workshop_id')
      .notNull()
      .references(() => workshops.id, { onDelete: 'cascade' }),
    /** HMAC-SHA256(pepper, slug + ":" + code), hex. Never the code. ADR 0002. */
    codeHash: text('code_hash').notNull(),
    createdDay: date('created_day', { mode: 'string' }).notNull(),
    /** The wave they came through, or null for an invite. Never who invited them. */
    wave: text('wave'),
    invitesLeft: integer('invites_left').notNull(),
  },
  (t) => [uniqueIndex('participants_workshop_code').on(t.workshopId, t.codeHash)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** Client-generated. */
    id: uuid('id').primaryKey(),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    sessionNo: integer('session_no').notNull(),
    startedDay: date('started_day', { mode: 'string' }).notNull(),
    deckVersion: text('deck_version').notNull(),
    seed: text('seed').notNull(),
  },
  (t) => [index('sessions_participant').on(t.participantId)],
);

export const events = pgTable(
  'events',
  {
    /** Client-generated. Stored at most once; a re-sent event is ignored. */
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    cardId: text('card_id').notNull(),
    seq: integer('seq').notNull(),
    kind: text('kind').notNull(), // EVENT_KINDS in contracts
    /** The sealed answer, "v1." + base64, only for kind = answered. The server cannot read it. */
    body: text('body'),
    createdDay: date('created_day', { mode: 'string' }).notNull(),
    deckVersion: text('deck_version').notNull(),
  },
  (t) => [index('events_session').on(t.sessionId)],
);

export const invites = pgTable(
  'invites',
  {
    /** SHA-256 of the token, hex. The token itself is only ever in the link. */
    tokenHash: text('token_hash').primaryKey(),
    workshopId: uuid('workshop_id')
      .notNull()
      .references(() => workshops.id, { onDelete: 'cascade' }),
    issuerParticipantId: uuid('issuer_participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    /** A boolean, not a date: join days must not line up with redemption days (ADR 0006). */
    used: boolean('used').notNull().default(false),
  },
  (t) => [index('invites_issuer').on(t.issuerParticipantId)],
);

/** Written by the nightly backup job after each successful run; read by the health endpoint. */
export const backupRuns = pgTable('backup_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(), // 'database' | 'workshop:<slug>'
  finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'string' }).notNull(),
  ok: boolean('ok').notNull(),
});

/**
 * Rate limiting without addresses (ADR 0012). The key is route + minute + either the code hash
 * (authenticated routes) or the workshop (unauthenticated routes). Rows older than an hour are
 * deleted by the nightly job. Nothing here identifies a person.
 */
export const rateBuckets = pgTable('rate_buckets', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true, mode: 'string' }).notNull(),
});
