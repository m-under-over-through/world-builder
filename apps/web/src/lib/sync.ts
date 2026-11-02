import {
  joinRequestSchema,
  meResponseSchema,
  syncResponseSchema,
  type JoinRequest,
  type MeResponse,
} from '@wb/contracts';
import { api, type ApiResult } from './api.ts';
import { makeBatches } from './batches.ts';
import { localDay, type WorkshopStore } from './store.ts';

export interface SyncStatus {
  lastResult: 'never' | 'ok' | 'offline' | 'error';
  lastError?: string;
  outboxSize: number;
}

/** The setting that holds a join the device could not send (docs/screen-map.md, Intro 3). */
export const PENDING_JOIN = 'pendingJoin';

/**
 * A join made offline waits on the device and goes out before anything else: the session
 * starts anyway, with the code the device generated, and the server learns of the participant
 * when the network is back. Nothing is lost; the server refuses events, and GET /me, for a code
 * it does not know, so the join has to land first.
 */
export async function queueJoin(store: WorkshopStore, join: JoinRequest): Promise<void> {
  await store.set(PENDING_JOIN, JSON.stringify(join));
}

/**
 * The queued join, or null. A stored value that is not a join as the contract spells it (a
 * damaged row, an older shape) is forgotten on the spot, so it is not read and ignored on every
 * open from then on.
 */
export async function pendingJoin(store: WorkshopStore): Promise<JoinRequest | null> {
  const stored = await store.get(PENDING_JOIN);
  if (!stored) return null;
  try {
    return joinRequestSchema.parse(JSON.parse(stored));
  } catch {
    await store.settings.delete(PENDING_JOIN);
    return null;
  }
}

/** Send the queued join, if any. Null when there was nothing to send. */
export async function sendPendingJoin(
  store: WorkshopStore,
  slug: string,
): Promise<ApiResult<unknown> | null> {
  const join = await pendingJoin(store);
  if (!join) return null;
  const res = await api(`/${slug}/join`, { body: join });
  if (res.ok) await store.settings.delete(PENDING_JOIN);
  return res;
}

/** The status after a request that failed: offline when nothing answered, otherwise the server's code. */
async function failed(store: WorkshopStore, res: ApiResult<unknown> & { ok: false }) {
  const remaining = await store.pending();
  return {
    lastResult: res.status === 0 ? 'offline' : 'error',
    lastError: res.error,
    outboxSize: remaining.events.length,
  } satisfies SyncStatus;
}

/** Push the outbox in batches. Idempotent on the server, so a retry can never duplicate. */
export async function syncNow(
  store: WorkshopStore,
  slug: string,
  code: string,
): Promise<SyncStatus> {
  const joined = await sendPendingJoin(store, slug);
  if (joined && !joined.ok) return failed(store, joined);
  return pushOutbox(store, slug, code);
}

async function pushOutbox(store: WorkshopStore, slug: string, code: string): Promise<SyncStatus> {
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
  const remaining = await store.pending();
  return { lastResult: 'ok', outboxSize: remaining.events.length };
}

/**
 * On open: ask the server what it holds, re-queue anything it lacks (a restored database refills
 * itself from the phones), and prune accepted events past the retention window. Returns the
 * server's view for the privacy panel. A caller that has just asked GET /me itself ("I have a
 * code" checks the code that way) hands the answer in, so the server is not asked twice.
 */
export async function reconcile(
  store: WorkshopStore,
  slug: string,
  code: string,
  answer?: ApiResult<unknown>,
): Promise<MeResponse | null> {
  const res = answer ?? (await api<unknown>(`/${slug}/me`, { code }));
  if (!res.ok) return null;
  // The boundary is checked here as everywhere else: an answer that is not the contract's shape
  // (a proxy's error page, another version of the API) is treated as no answer, never as "the
  // server lacks everything", which would re-queue every retained event.
  const me = meResponseSchema.safeParse(res.data);
  if (!me.success) return null;
  const serverIds = new Set(me.data.events.map((e) => e.id));
  const local = await store.events.where('synced').equals(1).toArray();
  const missing = local.filter((e) => !serverIds.has(e.id)).map((e) => e.id);
  if (missing.length > 0) await store.markUnsynced(missing);
  await store.prune(localDay());
  return me.data;
}

/**
 * Everything a device with a code does when it opens, in the one order that works: the queued
 * join first, since the server answers AUTH_CODE_UNKNOWN to everything else for a code it has
 * not met; then the comparison with GET /me; then the outbox. While the join cannot go out,
 * nothing else is asked, and the panel's "what we store" stays empty rather than wrong.
 */
export async function syncOnOpen(
  store: WorkshopStore,
  slug: string,
  code: string,
  answer?: ApiResult<unknown>,
): Promise<{ me: MeResponse | null; sync: SyncStatus }> {
  const joined = await sendPendingJoin(store, slug);
  if (joined && !joined.ok) return { me: null, sync: await failed(store, joined) };
  const me = await reconcile(store, slug, code, answer);
  const sync = await pushOutbox(store, slug, code);
  return { me, sync };
}
