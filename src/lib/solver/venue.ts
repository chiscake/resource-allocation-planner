import type { ResolvedVenue } from "$lib/domain/types";

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/**
 * Default compute is always local (client).
 * Pass `forceCloud: true` for an authenticated one-shot Edge solve.
 * Offline → local even if forceCloud was requested.
 */
export function resolveVenue(options?: {
  forceCloud?: boolean;
  online?: boolean;
}): ResolvedVenue {
  const online = options?.online ?? isOnline();
  if (options?.forceCloud && online) return "cloud";
  return "local";
}
