/** Browser online / network-failure helpers for honest offline UX. */

export const DEFAULT_NETWORK_TIMEOUT_MS = 5000;

export class NetworkTimeoutError extends Error {
  readonly name = 'NetworkTimeoutError';
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
  }
}

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export type FetchWithTimeoutInit = RequestInit & { timeoutMs?: number };

/** `fetch` that rejects with NetworkTimeoutError when the timeout elapses. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS, signal, ...rest } = init;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new NetworkTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Race a thenable against a timeout (Supabase builders are PromiseLike, not Promise). */
export async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number = DEFAULT_NETWORK_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new NetworkTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Lightweight reachability check against the Supabase project URL.
 * Hits PostgREST with the publishable key (same CORS path as the JS client).
 * Any HTTP response (incl. 4xx) counts as reachable; timeout/network errors do not.
 */
export async function probeSupabase(
  baseUrl: string,
  opts?: { timeoutMs?: number; fetchImpl?: typeof fetch; anonKey?: string },
): Promise<boolean> {
  const root = baseUrl.replace(/\/$/, '');
  if (!root) return false;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_NETWORK_TIMEOUT_MS;
  const doFetch = opts?.fetchImpl ?? fetch;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts?.anonKey) {
    headers.apikey = opts.anonKey;
    headers.Authorization = `Bearer ${opts.anonKey}`;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await doFetch(`${root}/rest/v1/`, {
        method: 'GET',
        signal: controller.signal,
        headers,
      });
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

/** Best-effort: offline flag or common fetch/Supabase transport failure text. */
export function isLikelyNetworkFailure(err: unknown): boolean {
  if (!isOnline()) return true;
  if (err instanceof NetworkTimeoutError) return true;
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: unknown }).message ?? '')
      : err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : '';
  const lower = msg.toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('fetch failed') ||
    lower.includes('load failed') ||
    lower.includes('net::') ||
    lower.includes('offline') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('err_internet_disconnected') ||
    lower.includes('err_network_changed') ||
    lower.includes('err_connection') ||
    lower.includes('abort')
  );
}

/** Prefer a Russian network message over raw browser/Supabase text when offline-like. */
export function networkFailureMessage(err: unknown, offlineMsg: string): string {
  if (isLikelyNetworkFailure(err)) return offlineMsg;
  const raw =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: unknown }).message ?? '').trim()
      : err instanceof Error
        ? err.message.trim()
        : typeof err === 'string'
          ? err.trim()
          : '';
  return raw || offlineMsg;
}
