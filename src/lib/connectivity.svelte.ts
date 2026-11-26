import { env } from '$env/dynamic/public';
import { isOnline, probeSupabase, DEFAULT_NETWORK_TIMEOUT_MS } from '$lib/online';

/** Shared connectivity for header chip and offline list fallbacks. */
export const connectivity = $state({
  /** `navigator.onLine` (OS-level). */
  browserOnline: true,
  /**
   * Last probe result against Supabase.
   * `null` = not probed yet; `false` = unreachable (show offline chip).
   */
  apiReachable: null as boolean | null,
  probing: false,
});

/** True when the app should treat the backend as unavailable. */
export function isAppOffline(): boolean {
  if (!connectivity.browserOnline) return true;
  if (connectivity.apiReachable === false) return true;
  return false;
}

/** Inverse of isAppOffline — unknown probe still allows attempts. */
export function isAppOnline(): boolean {
  return !isAppOffline();
}

let started = false;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const RECOVER_POLL_MS = 10_000;

function supabaseUrl(): string {
  return (env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function anonKey(): string {
  return env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
}

function clearRecoverPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function ensureRecoverPoll() {
  if (typeof window === 'undefined' || pollTimer) return;
  pollTimer = setInterval(() => {
    if (!connectivity.browserOnline) return;
    if (connectivity.apiReachable !== false) {
      clearRecoverPoll();
      return;
    }
    if (connectivity.probing) return;
    void refreshConnectivityProbe();
  }, RECOVER_POLL_MS);
}

export async function refreshConnectivityProbe(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  connectivity.browserOnline = isOnline();
  if (!connectivity.browserOnline) {
    connectivity.apiReachable = false;
    ensureRecoverPoll();
    return false;
  }
  connectivity.probing = true;
  try {
    const ok = await probeSupabase(supabaseUrl(), {
      timeoutMs: DEFAULT_NETWORK_TIMEOUT_MS,
      anonKey: anonKey(),
    });
    connectivity.apiReachable = ok;
    if (ok) clearRecoverPoll();
    else ensureRecoverPoll();
    return ok;
  } finally {
    connectivity.probing = false;
  }
}

function scheduleProbe(delayMs = 0) {
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = setTimeout(() => {
    void refreshConnectivityProbe();
  }, delayMs);
}

function onBrowserOnline() {
  connectivity.browserOnline = true;
  scheduleProbe(0);
}

function onBrowserOffline() {
  connectivity.browserOnline = false;
  connectivity.apiReachable = false;
  ensureRecoverPoll();
}

function onVisibility() {
  if (document.visibilityState !== 'visible') return;
  if (!connectivity.browserOnline) return;
  // Docker pause/resume does not fire window online/offline — re-check on focus.
  scheduleProbe(0);
}

/** Idempotent: call once from AppShell. */
export function startConnectivityTracking(): () => void {
  if (typeof window === 'undefined') return () => {};
  connectivity.browserOnline = isOnline();
  if (started) {
    scheduleProbe(0);
    return () => {};
  }
  started = true;
  window.addEventListener('online', onBrowserOnline);
  window.addEventListener('offline', onBrowserOffline);
  window.addEventListener('focus', onVisibility);
  document.addEventListener('visibilitychange', onVisibility);
  scheduleProbe(0);
  return () => {
    window.removeEventListener('online', onBrowserOnline);
    window.removeEventListener('offline', onBrowserOffline);
    window.removeEventListener('focus', onVisibility);
    document.removeEventListener('visibilitychange', onVisibility);
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = null;
    clearRecoverPoll();
    started = false;
  };
}
