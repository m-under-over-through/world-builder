import {
  joinRequestSchema,
  type JoinRequest,
  type MeResponse,
  type SyncResponse,
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
 * A join made offline waits on the device and goes out before the first sync: the session
 * starts anyway, with the code the device generated, and the server learns of the participant
 * when the network is back. Nothing is lost; the server refuses events for a code it does not
 * know, so the join has to land first.
 */
export async function queueJoin(store: WorkshopStore, join: JoinRequest): Promise<void> {
  await store.set(PENDING_JOIN, JSON.stringify(join));
}

export async function pendingJoin(store: WorkshopStore): Promise<JoinRequest | null> {
  const stored = await store.get(PENDING_JOIN);
  if (!stored) return null;
  try {
    return joinRequestSchema.parse(JSON.parse(stored));
  } catch {
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

/** Push the outbox in batches. Idempotent on the server, so a retry can never duplicate. */
export async function syncNow(
  store: WorkshopStore,
  slug: string,
  code: string,
): Promise<SyncStatus> {
  const joined = await sendPendingJoin(store, slug);
  if (joined && !joined.ok) {
    const remaining = await store.pending();
    return {
      lastResult: joined.status === 0 ? 'offline' : 'error',
      lastError: joined.error,
      outboxSize: remaining.events.length,
    };
  }
  const { sessions, events } = await store.pending();
  for (const batch of makeBatches(sessions, events)) {
    const res = await api<SyncResponse>(`/${slug}/sync`, { body: batch, code });
    if (!res.ok) {
      const remaining = await store.pending();
      return {
        lastResult: res.status === 0 ? 'offline' : 'error',
        lastError: res.error,
        outboxSize: remaining.events.length,
      };
    }
    await store.markSynced(res.data.acceptedSessionIds, res.data.acceptedEventIds, localDay());
  }
  const remaining = await store.pending();
  return { lastResult: 'ok', outboxSize: remaining.events.length };
}

/**
 * On open: ask the server what it holds, re-queue anything it lacks (a restored database refills
 * itself from the phones), and prune accepted events past the retention window. Returns the
 * server's view for the privacy panel.
 */
export async function reconcile(
  store: WorkshopStore,
  slug: string,
  code: string,
): Promise<MeResponse | null> {
  const res = await api<MeResponse>(`/${slug}/me`, { code });
  if (!res.ok) return null;
  const serverIds = new Set(res.data.events.map((e) => e.id));
  const local = await store.events.where('synced').equals(1).toArray();
  const missing = local.filter((e) => !serverIds.has(e.id)).map((e) => e.id);
  if (missing.length > 0) await store.markUnsynced(missing);
  await store.prune(localDay());
  return res.data;
}
