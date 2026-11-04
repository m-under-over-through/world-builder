import {
  joinRequestSchema,
  meResponseSchema,
  syncResponseSchema,
  type JoinRequest,
  type MeResponse,
} from '@wb/contracts';
import { api, type ApiResult } from './api.ts';
import { makeBatches } from './batches.ts';
import { localDay, type Store } from './store.ts';

export interface SyncStatus {
  lastResult: 'never' | 'ok' | 'offline' | 'error';
  lastError?: string;
  /** Events waiting in the outbox. */
  outboxSize: number;
  /** Sessions waiting in the outbox (a session row goes out before its events). */
  outboxSessions: number;
}

/** The setting that holds the day of the last sync the server accepted. */
export const LAST_SYNC_DAY = 'lastSyncDay';

/** The setting that holds a join the device could not send (docs/screen-map.md, Intro 3). */
export const PENDING_JOIN = 'pendingJoin';

/**
 * A join made offline waits on the device and goes out before anything else: the session
 * starts anyway, with the code the device generated, and the server learns of the participant
 * when the network is back. Nothing is lost; the server refuses events, and GET /me, for a code
 * it does not know, so the join has to land first.
 */
export async function queueJoin(store: Store, join: JoinRequest): Promise<void> {
  await store.set(PENDING_JOIN, JSON.stringify(join));
}

/**
 * The queued join, or null. A stored value that is not a join as the contract spells it (a
 * damaged row, an older shape) is forgotten on the spot, so it is not read and ignored on every
 * open from then on.
 */
export async function pendingJoin(store: Store): Promise<JoinRequest | null> {
  const stored = await store.get(PENDING_JOIN);
  if (!stored) return null;
  try {
    return joinRequestSchema.parse(JSON.parse(stored));
  } catch {
    await store.unset(PENDING_JOIN);
    return null;
  }
}

/** Send the queued join, if any. Null when there was nothing to send. */
export async function sendPendingJoin(
  store: Store,
  slug: string,
): Promise<ApiResult<unknown> | null> {
  const join = await pendingJoin(store);
  if (!join) return null;
  const res = await api(`/${slug}/join`, { body: join });
  // JOIN_CODE_TAKEN means the server already knows the code, so the join is done: for a link's
  // code, the same participant joined from another device (ADR 0018); for a code the device
  // made, an earlier try landed and its answer was lost. A collision with someone else's code
  // (one in 10^16) is accepted here on purpose: a queued join has no code to fall back to, since
  // events may already carry this one, and a wrong participant is caught on the next open.
  if (res.ok || res.error === 'JOIN_CODE_TAKEN') {
    await store.unset(PENDING_JOIN);
    return { ok: true, data: {} };
  }
  return res;
}

/** The status after a request that failed: offline when nothing answered, otherwise the server's code. */
async function failed(store: Store, res: ApiResult<unknown> & { ok: false }) {
  const remaining = await store.pending();
  return {
    lastResult: res.status === 0 ? 'offline' : 'error',
    lastError: res.error,
    outboxSize: remaining.events.length,
    outboxSessions: remaining.sessions.length,
  } satisfies SyncStatus;
}

/** Push the outbox in batches. Idempotent on the server, so a retry can never duplicate. */
export async function syncNow(store: Store, slug: string, code: string): Promise<SyncStatus> {
  const joined = await sendPendingJoin(store, slug);
  if (joined && !joined.ok) return failed(store, joined);
  return pushOutbox(store, slug, code);
}

async function pushOutbox(store: Store, slug: string, code: string): Promise<SyncStatus> {
  const { sessions, events } = await store.pending();
  for (const batch of makeBatches(sessions, events)) {
    const res = await api<unknown>(`/${slug}/sync`, { body: batch, code });
    if (!res.ok) return failed(store, res);
    // An answer of another shape than the contract's marks nothing as accepted: the batch stays
    // in the outbox and is sent again, which the server takes without duplicating.
    const accepted = syncResponseSchema.safeParse(res.data);
    if (!accepted.success)
      return failed(store, { ok: false, error: 'CLIENT_SYNC_FAILED', status: 0 });
    await store.markSynced(
      accepted.data.acceptedSessionIds,
      accepted.data.acceptedEventIds,
      localDay(),
    );
  }
  await store.set(LAST_SYNC_DAY, localDay());
  const remaining = await store.pending();
  return {
    lastResult: 'ok',
    outboxSize: remaining.events.length,
    outboxSessions: remaining.sessions.length,
  };
}

/**
 * On open: ask the server what it holds, re-queue anything it lacks (a restored database refills
 * itself from the phones: sessions as well as events, since an event needs its session row), and
 * prune accepted events past the retention window. Returns the server's view for the privacy
 * panel. A caller that has just asked GET /me itself (a link's code is checked that way)
 * hands the answer in, so the server is not asked twice.
 */
export async function reconcile(
  store: Store,
  slug: string,
  code: string,
  answer?: ApiResult<unknown>,
): Promise<{ me: MeResponse | null; error?: string }> {
  const res = answer ?? (await api<unknown>(`/${slug}/me`, { code }));
  if (!res.ok) return { me: null, error: res.error };
  // The boundary is checked here as everywhere else: an answer that is not the contract's shape
  // (a proxy's error page, another version of the API) is treated as no answer, never as "the
  // server lacks everything", which would re-queue every retained event.
  const me = meResponseSchema.safeParse(res.data);
  if (!me.success) return { me: null, error: 'CLIENT_SYNC_FAILED' };
  const serverSessions = new Set(me.data.sessions.map((s) => s.id));
  const serverEvents = new Set(me.data.events.map((e) => e.id));
  const local = await store.accepted();
  const sessions = local.sessionIds.filter((id) => !serverSessions.has(id));
  const events = local.eventIds.filter((id) => !serverEvents.has(id));
  if (sessions.length > 0 || events.length > 0) await store.markUnsynced(sessions, events);
  await store.prune(localDay());
  return { me: me.data };
}

/**
 * Everything a device with a code does when it opens, in the one order that works: the queued
 * join first, since the server answers AUTH_CODE_UNKNOWN to everything else for a code it has
 * not met; then the comparison with GET /me; then the outbox. While the join cannot go out,
 * nothing else is asked, and the panel's "what we store" stays empty rather than wrong.
 */
export async function syncOnOpen(
  store: Store,
  slug: string,
  code: string,
  answer?: ApiResult<unknown>,
): Promise<{ me: MeResponse | null; sync: SyncStatus; error?: string }> {
  const joined = await sendPendingJoin(store, slug);
  if (joined && !joined.ok) return { me: null, sync: await failed(store, joined) };
  const { me, error } = await reconcile(store, slug, code, answer);
  const sync = await pushOutbox(store, slug, code);
  return error === undefined ? { me, sync } : { me, sync, error };
}
