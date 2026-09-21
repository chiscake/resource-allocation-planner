import type { ResolvedVenue, VenuePreference } from "$lib/domain/types";
import { isTauri } from "$lib/platform";

const PREF_KEY = "rap_compute_venue";

export function getVenuePreference(): VenuePreference {
  if (typeof localStorage === "undefined") return "auto";
  const v = localStorage.getItem(PREF_KEY);
  if (v === "cloud" || v === "local" || v === "auto") return v;
  return "auto";
}

export function setVenuePreference(pref: VenuePreference): void {
  localStorage.setItem(PREF_KEY, pref);
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/**
 * Web: always cloud when online (UI choice hidden).
 * Tauri: honor preference when online; offline → local.
 */
export function resolveVenue(options?: {
  preference?: VenuePreference;
  online?: boolean;
  forceLocal?: boolean;
}): ResolvedVenue {
  if (options?.forceLocal) return "local";
  const online = options?.online ?? isOnline();
  if (!online) return "local";

  const tauri = typeof window !== "undefined" && isTauri();
  if (!tauri) return "cloud";

  const pref = options?.preference ?? getVenuePreference();
  if (pref === "local") return "local";
  return "cloud";
}
