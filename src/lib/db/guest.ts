import { createBlankModel, cloneModel, type Model } from "$lib/domain";
import { t } from "$lib/i18n";

const GUEST_KEY = "rap_guest_slot";

export interface GuestWhatIfRow {
  title: string;
  Z: number;
}

export interface GuestSnapshot {
  title: string;
  model: unknown;
  result?: unknown;
  /** Last local sensitivity pack (simplified table under result). */
  what_if_items?: GuestWhatIfRow[];
  updated_at: string;
}

export function loadGuest(): GuestSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(GUEST_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuestSnapshot;
  } catch {
    return null;
  }
}

export function saveGuest(snapshot: GuestSnapshot): void {
  localStorage.setItem(GUEST_KEY, JSON.stringify(snapshot));
}

export function clearGuest(): void {
  localStorage.removeItem(GUEST_KEY);
}

/** One local scenario slot — blank model for «Новая задача». */
export function saveGuestBlank(title = t("newTask")): GuestSnapshot {
  const snapshot: GuestSnapshot = {
    title,
    model: createBlankModel(),
    updated_at: new Date().toISOString(),
  };
  saveGuest(snapshot);
  return snapshot;
}

/** @deprecated Prefer saveGuestBlank — kept for callers that still seed the guest slot. */
export function saveGuestTask13(): GuestSnapshot {
  return saveGuestBlank();
}

/** Put an arbitrary model into the single guest slot (e.g. public template). */
export function saveGuestModel(title: string, model: Model): GuestSnapshot {
  const snapshot: GuestSnapshot = {
    title,
    model: cloneModel(model),
    updated_at: new Date().toISOString(),
  };
  saveGuest(snapshot);
  return snapshot;
}
