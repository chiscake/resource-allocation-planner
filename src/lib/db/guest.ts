import { createBlankModel, createTask13Model, type Model } from "$lib/domain";

const GUEST_KEY = "rap_guest_slot";

export interface GuestSnapshot {
  title: string;
  model: unknown;
  result?: unknown;
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
export function saveGuestBlank(title = "Новая задача"): GuestSnapshot {
  const snapshot: GuestSnapshot = {
    title,
    model: createBlankModel(),
    updated_at: new Date().toISOString(),
  };
  saveGuest(snapshot);
  return snapshot;
}

/** Seed / reset the guest slot to Task 13. */
export function saveGuestTask13(): GuestSnapshot {
  const snapshot: GuestSnapshot = {
    title: "Задача 13 (гость)",
    model: createTask13Model(),
    updated_at: new Date().toISOString(),
  };
  saveGuest(snapshot);
  return snapshot;
}

/** Put an arbitrary model into the single guest slot (e.g. public template). */
export function saveGuestModel(title: string, model: Model): GuestSnapshot {
  const snapshot: GuestSnapshot = {
    title,
    model: structuredClone(model),
    updated_at: new Date().toISOString(),
  };
  saveGuest(snapshot);
  return snapshot;
}
