import { vi } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory } from 'fake-indexeddb';

/**
 * What the client's tests share: the API as a stub that answers by path, a fresh in-memory
 * IndexedDB per test, and a browser that pretends to be a given platform.
 */
export type Answer = { status: number; body: unknown; headers?: Record<string, string> };
export type Routes = Record<string, (() => Answer | 'offline')[]>;

/** A stub that answers by path, in order of the calls to the same path; 200 and {} once the list runs out. */
export function stubRoutes(routes: Routes) {
  const calls: { path: string; method: string; body: unknown; headers: Record<string, string> }[] =
    [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const path = String(input);
      calls.push({
        path,
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(String(init.body)) : undefined,
        headers: { ...(init.headers as Record<string, string> | undefined) },
      });
      const queue = routes[path] ?? [];
      // A path the test did not list answers 200 and {}; a sync answers the contract's shape, so
      // the outbox empties and the retry loop (instant waits in tests) has nothing to wait for.
      const fallback = (): Answer =>
        path.endsWith('/sync') ? SYNCED() : { status: 200, body: {} };
      const answer = (queue.shift() ?? fallback)();
      if (answer === 'offline') throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'content-type': 'application/json', ...answer.headers },
      });
    }),
  );
  return calls;
}

export const JOINED = (): Answer => ({ status: 200, body: { ok: true } });
export const SYNCED = (): Answer => ({
  status: 200,
  body: { acceptedSessionIds: [], acceptedEventIds: [] },
});

/** A fresh in-memory IndexedDB, so nothing one test stored (a code, an arrival) reaches the next. */
export function freshIndexedDb(): void {
  const fresh = new IDBFactory();
  vi.stubGlobal('indexedDB', fresh);
  Dexie.dependencies.indexedDB = fresh;
}

/**
 * Make the test browser call itself a platform. The property is defined on the navigator
 * object itself, in front of the prototype's getter; `restoreUserAgent` deletes it again, so a
 * later test sees the test DOM's own string and not the last test's platform.
 */
export function pretendUserAgent(value: string): void {
  Object.defineProperty(navigator, 'userAgent', { value, configurable: true });
}

export function restoreUserAgent(): void {
  delete (navigator as { userAgent?: string }).userAgent;
}
