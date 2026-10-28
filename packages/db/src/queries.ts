import { and, count, desc, eq, inArray, isNotNull, max, sql } from 'drizzle-orm';
import type { Event, Session } from '@wb/contracts';
import type { Db } from './types.ts';
import {
  backupRuns,
  events,
  invites,
  participants,
  rateBuckets,
  sessions,
  waves,
  workshops,
} from './schema.ts';

/**
 * Every query that touches participant data takes a workshop id or a participant id that was
 * found through one, and filters on it. There is no "all participants" query anywhere.
 *
 * The Neon HTTP driver runs one statement per request and has no interactive transactions, so
 * each operation here is a single atomic statement where it matters (upsert, conditional update)
 * and the rare races are documented where they exist.
 */

export type Workshop = typeof workshops.$inferSelect;
export type Participant = typeof participants.$inferSelect;

export async function findWorkshop(db: Db, slug: string): Promise<Workshop | undefined> {
  return db.query.workshops.findFirst({ where: eq(workshops.slug, slug) });
}

/** Counts one open of a wave link. Returns false if the wave does not exist for this workshop. */
export async function waveOpened(db: Db, workshopId: string, wave: string): Promise<boolean> {
  const updated = await db
    .update(waves)
    .set({ openedCount: sql`${waves.openedCount} + 1` })
    .where(and(eq(waves.workshopId, workshopId), eq(waves.wave, wave)))
    .returning({ wave: waves.wave });
  return updated.length > 0;
}

export type JoinResult =
  | { ok: true; participant: Participant }
  | {
      ok: false;
      reason: 'wave_unknown' | 'wave_full' | 'invite_invalid' | 'invite_used' | 'code_taken';
    };

export async function joinViaWave(
  db: Db,
  input: { workshop: Workshop; wave: string; codeHash: string; today: string },
): Promise<JoinResult> {
  const w = await db.query.waves.findFirst({
    where: and(eq(waves.workshopId, input.workshop.id), eq(waves.wave, input.wave)),
  });
  if (!w) return { ok: false, reason: 'wave_unknown' };
  // The cap is a safety valve, not an exact count: two joins in the same instant can both pass
  // this check. Being off by one or two on a cap of 150 is accepted (ADR 0006).
  if (w.joinedCount >= input.workshop.cap) return { ok: false, reason: 'wave_full' };
  const inserted = await db
    .insert(participants)
    .values({
      workshopId: input.workshop.id,
      codeHash: input.codeHash,
      createdDay: input.today,
      wave: input.wave,
      invitesLeft: input.workshop.invitesPerParticipant,
    })
    .onConflictDoNothing({ target: [participants.workshopId, participants.codeHash] })
    .returning();
  const participant = inserted[0];
  if (!participant) return { ok: false, reason: 'code_taken' };
  await db
    .update(waves)
    .set({ joinedCount: sql`${waves.joinedCount} + 1` })
    .where(and(eq(waves.workshopId, input.workshop.id), eq(waves.wave, input.wave)));
  return { ok: true, participant };
}

export async function joinViaInvite(
  db: Db,
  input: { workshop: Workshop; tokenHash: string; codeHash: string; today: string },
): Promise<JoinResult> {
  // One statement claims the invite: it only succeeds if the token exists, belongs to this
  // workshop, and is unused. Two redemptions in the same instant cannot both succeed.
  const claimed = await db
    .update(invites)
    .set({ used: true })
    .where(
      and(
        eq(invites.tokenHash, input.tokenHash),
        eq(invites.workshopId, input.workshop.id),
        eq(invites.used, false),
      ),
    )
    .returning({ tokenHash: invites.tokenHash });
  if (claimed.length === 0) {
    const exists = await db.query.invites.findFirst({
      where: and(eq(invites.tokenHash, input.tokenHash), eq(invites.workshopId, input.workshop.id)),
    });
    return { ok: false, reason: exists ? 'invite_used' : 'invite_invalid' };
  }
  const inserted = await db
    .insert(participants)
    .values({
      workshopId: input.workshop.id,
      codeHash: input.codeHash,
      createdDay: input.today,
      wave: null,
      invitesLeft: input.workshop.invitesPerParticipant,
    })
    .onConflictDoNothing({ target: [participants.workshopId, participants.codeHash] })
    .returning();
  const participant = inserted[0];
  // A code collision here (1 in 10^16) consumes the invite; the client retries with a new code
  // and a fresh invite would be needed. Accepted.
  if (!participant) return { ok: false, reason: 'code_taken' };
  return { ok: true, participant };
}

export async function findParticipant(
  db: Db,
  workshopId: string,
  codeHash: string,
): Promise<Participant | undefined> {
  return db.query.participants.findFirst({
    where: and(eq(participants.workshopId, workshopId), eq(participants.codeHash, codeHash)),
  });
}

export async function participantSummary(db: Db, participant: Participant) {
  const [row] = await db
    .select({ n: count() })
    .from(sessions)
    .where(eq(sessions.participantId, participant.id));
  return {
    createdDay: participant.createdDay,
    invitesLeft: participant.invitesLeft,
    wave: participant.wave,
    sessionsCount: row?.n ?? 0,
  };
}

/**
 * Store a batch. Append-only and idempotent: rows that already exist are left as they are, and a
 * row is accepted only if it exists afterwards under a session of this participant. A session id
 * that belongs to someone else is silently not accepted, and so are its events; nothing in the
 * response says why, because the response goes to the device that sent it.
 */
export async function syncBatch(
  db: Db,
  participantId: string,
  batch: { sessions: Session[]; events: Event[] },
): Promise<{ acceptedSessionIds: string[]; acceptedEventIds: string[] }> {
  if (batch.sessions.length > 0) {
    await db
      .insert(sessions)
      .values(batch.sessions.map((s) => ({ ...s, participantId })))
      .onConflictDoNothing({ target: sessions.id });
  }
  const sessionIds = new Set([
    ...batch.sessions.map((s) => s.id),
    ...batch.events.map((e) => e.sessionId),
  ]);
  const mine =
    sessionIds.size === 0
      ? []
      : await db
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(eq(sessions.participantId, participantId), inArray(sessions.id, [...sessionIds])),
          );
  const mineIds = new Set(mine.map((s) => s.id));
  const acceptedSessionIds = batch.sessions.map((s) => s.id).filter((id) => mineIds.has(id));

  const insertable = batch.events.filter((e) => mineIds.has(e.sessionId));
  if (insertable.length > 0) {
    await db
      .insert(events)
      .values(insertable.map((e) => ({ ...e, body: e.body ?? null })))
      .onConflictDoNothing({ target: events.id });
  }
  const eventIds = batch.events.map((e) => e.id);
  const stored =
    eventIds.length === 0
      ? []
      : await db
          .select({ id: events.id })
          .from(events)
          .innerJoin(sessions, eq(events.sessionId, sessions.id))
          .where(and(eq(sessions.participantId, participantId), inArray(events.id, eventIds)));
  return { acceptedSessionIds, acceptedEventIds: stored.map((e) => e.id) };
}

/** Everything the server holds for one participant: the rows behind "what we store about you". */
export async function participantData(
  db: Db,
  participantId: string,
): Promise<{ sessions: Session[]; events: Event[] }> {
  const mySessions = await db.query.sessions.findMany({
    where: eq(sessions.participantId, participantId),
    orderBy: [sessions.sessionNo],
  });
  const ids = mySessions.map((s) => s.id);
  const myEvents =
    ids.length === 0
      ? []
      : await db.query.events.findMany({
          where: inArray(events.sessionId, ids),
          orderBy: [events.seq],
        });
  return {
    sessions: mySessions.map(({ id, sessionNo, startedDay, deckVersion, seed }) => ({
      id,
      sessionNo,
      startedDay,
      deckVersion,
      seed,
    })),
    events: myEvents.map(({ id, sessionId, cardId, seq, kind, body, createdDay, deckVersion }) => ({
      id,
      sessionId,
      cardId,
      seq,
      kind: kind as Event['kind'],
      ...(body === null ? {} : { body }),
      createdDay,
      deckVersion,
    })),
  };
}

/** Spend up to `tokenHashes.length` invites. Returns how many were actually created. */
export async function createInvites(
  db: Db,
  participant: Participant,
  tokenHashes: string[],
): Promise<number> {
  const claimed = await db
    .update(participants)
    .set({ invitesLeft: sql`${participants.invitesLeft} - ${tokenHashes.length}` })
    .where(
      and(
        eq(participants.id, participant.id),
        sql`${participants.invitesLeft} >= ${tokenHashes.length}`,
      ),
    )
    .returning({ invitesLeft: participants.invitesLeft });
  if (claimed.length === 0) return 0;
  await db.insert(invites).values(
    tokenHashes.map((tokenHash) => ({
      tokenHash,
      workshopId: participant.workshopId,
      issuerParticipantId: participant.id,
    })),
  );
  return tokenHashes.length;
}

/** "Delete everything about me." Sessions, events and issued invites go with the row. */
export async function deleteParticipant(db: Db, participantId: string): Promise<void> {
  await db.delete(participants).where(eq(participants.id, participantId));
}

export async function healthReport(db: Db, today: string) {
  const [backup] = await db
    .select({ at: max(backupRuns.finishedAt) })
    .from(backupRuns)
    .where(eq(backupRuns.ok, true));
  const [todays] = await db.select({ n: count() }).from(events).where(eq(events.createdDay, today));
  const list = await db
    .select({ slug: workshops.slug, status: workshops.status })
    .from(workshops)
    .orderBy(workshops.slug);
  return {
    lastBackupAt: backup?.at ?? null,
    eventsToday: todays?.n ?? 0,
    workshops: list.map((w) => ({
      slug: w.slug,
      status: w.status as 'draft' | 'open' | 'closed' | 'exported' | 'deleted',
    })),
  };
}

/**
 * Rate limiting without addresses (ADR 0012). One upsert per request: the bucket for this key and
 * this minute is created or incremented, and the request is allowed while the count is within the
 * limit. `subject` is a code hash for authenticated routes or the workshop id for the rest.
 */
export async function rateLimitAllows(
  db: Db,
  input: { route: string; subject: string; limitPerMinute: number; now: Date },
): Promise<boolean> {
  const minute = Math.floor(input.now.getTime() / 60_000);
  const key = `${input.route}:${minute}:${input.subject}`;
  const windowStart = new Date(minute * 60_000).toISOString();
  const [row] = await db
    .insert(rateBuckets)
    .values({ key, count: 1, windowStart })
    .onConflictDoUpdate({ target: rateBuckets.key, set: { count: sql`${rateBuckets.count} + 1` } })
    .returning({ count: rateBuckets.count });
  return (row?.count ?? Infinity) <= input.limitPerMinute;
}

/** Called by the nightly job. */
export async function recordBackupRun(
  db: Db,
  kind: string,
  ok: boolean,
  finishedAt: Date,
): Promise<void> {
  await db.insert(backupRuns).values({ kind, ok, finishedAt: finishedAt.toISOString() });
}

/** Called by the nightly job: buckets older than an hour carry nothing worth keeping. */
export async function pruneRateBuckets(db: Db, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 60 * 60_000).toISOString();
  await db.delete(rateBuckets).where(sql`${rateBuckets.windowStart} < ${cutoff}`);
}

// Keep these imports referenced for the day they are needed in queries above.
void desc;
void isNotNull;
