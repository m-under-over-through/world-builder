import { AUTH_SCHEME, ERROR_CODES, type ErrorCode } from '@wb/contracts';

/** One place that talks to the API, on this origin only, with the code in a header and never in a URL. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: ErrorCode | 'CLIENT_SYNC_FAILED';
      status: number;
      /** On a 429: how many seconds the server asks the client to wait (its Retry-After header). */
      retryAfter?: number;
    };

/** A 429 without a readable Retry-After (an older API) is retried after this many seconds. */
export const DEFAULT_RETRY_AFTER_SECONDS = 5;
/** The rate buckets are per minute, so no wait the server asks for is longer than this. */
export const MAX_RETRY_AFTER_SECONDS = 60;

/** The seconds in a Retry-After header, 1 to 60, or undefined when the header is missing or not seconds. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header.trim())) return undefined;
  return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, Number(header.trim())));
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; code?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.code) headers['authorization'] = `${AUTH_SCHEME} ${init.code}`;
  try {
    const request: RequestInit = {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
    };
    if (init.body !== undefined) request.body = JSON.stringify(init.body);
    const res = await fetch(`/api${path}`, request);
    const data = (await res.json().catch(() => null)) as T | { error?: string } | null;
    if (res.ok) return { ok: true, data: data as T };
    const code = (data as { error?: string } | null)?.error;
    const retryAfter =
      res.status === 429 ? parseRetryAfter(res.headers.get('retry-after')) : undefined;
    return {
      ok: false,
      error: code && code in ERROR_CODES ? (code as ErrorCode) : 'CLIENT_SYNC_FAILED',
      status: res.status,
      ...(retryAfter === undefined ? {} : { retryAfter }),
    };
  } catch {
    return { ok: false, error: 'CLIENT_SYNC_FAILED', status: 0 };
  }
}
