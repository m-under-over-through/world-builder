import type { MeResponse, SyncResponse } from '@wb/contracts';
import { api } from './api.ts';
import { makeBatches } from './batches.ts';
import { localDay, type WorkshopStore } from './store.ts';

export interface SyncStatus {
  lastResult: 'never' | 'ok' | 'offline' | 'error';
  lastError?: string;
  outboxSize: number;
}

/** Push the outbox in batches. Idempotent on the server, so a retry can never duplicate. */
export async function syncNow(
  store: WorkshopStore,
  slug: string,
  code: string,
): Promise<SyncStatus> {
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
