/** Browser online / network-failure helpers for honest offline UX. */

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/** Best-effort: offline flag or common fetch/Supabase transport failure text. */
export function isLikelyNetworkFailure(err: unknown): boolean {
  if (!isOnline()) return true;
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
    lower.includes('err_internet_disconnected') ||
    lower.includes('err_network_changed') ||
    lower.includes('err_connection')
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
