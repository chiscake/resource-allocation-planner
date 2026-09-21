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
