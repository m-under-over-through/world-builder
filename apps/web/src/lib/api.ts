import { AUTH_SCHEME, ERROR_CODES, type ErrorCode } from '@wb/contracts';

/** One place that talks to the API, on this origin only, with the code in a header and never in a URL. */
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ErrorCode | 'CLIENT_SYNC_FAILED'; status: number };

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
    return {
      ok: false,
      error: code && code in ERROR_CODES ? (code as ErrorCode) : 'CLIENT_SYNC_FAILED',
      status: res.status,
    };
  } catch {
    return { ok: false, error: 'CLIENT_SYNC_FAILED', status: 0 };
  }
}
