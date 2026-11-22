import { createBlankModel, cloneModel, type Model } from '$lib/domain';
import type { GuestWhatIfGeneration, GuestWhatIfState } from '$lib/domain/whatif-generation';
import { emptyGuestWhatIfState } from '$lib/domain/whatif-generation';
import { t } from '$lib/i18n';

const GUEST_KEY = 'rap_guest_slot';

export interface GuestWhatIfRow {
  title: string;
  Z: number;
  before?: string;
  after?: string;
  deltaZ?: number;
  shadowMetric?: number | null;
  /** Partial rows from older guest slots are tolerated at hydrate. */
  [key: string]: unknown;
}

export interface GuestSnapshot {
  title: string;
  model: unknown;
  result?: unknown;
  solver_meta?: unknown;
  /**
   * @deprecated Prefer `what_if_state`. Kept so older localStorage slots still hydrate.
   */
  what_if_items?: GuestWhatIfRow[];
  /** Multi-generation sensitivity history (no soft-delete / 30-day purge). */
  what_if_state?: GuestWhatIfState;
  updated_at: string;
}

export function loadGuest(): GuestSnapshot | null {
  if (typeof localStorage === 'undefined') return null;
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

/** Normalize guest what-if history (legacy single pack → one generation). */
export function guestWhatIfStateFromSnapshot(
  guest: GuestSnapshot | null | undefined,
): GuestWhatIfState {
  if (guest?.what_if_state?.generations) {
    return {
      generations: guest.what_if_state.generations,
      activeGeneration: guest.what_if_state.activeGeneration ?? null,
    };
  }
  return emptyGuestWhatIfState();
}

export function isGuestWorthUploading(guest: GuestSnapshot): boolean {
  if (guest.result != null) return true;
  if (guest.what_if_state?.generations?.length) return true;
  if (guest.what_if_items && guest.what_if_items.length > 0) return true;
  try {
    return JSON.stringify(guest.model) !== JSON.stringify(createBlankModel());
  } catch {
    return true;
  }
}

/** One local scenario slot — blank model for «Новая задача». */
export function saveGuestBlank(title = t('newTask')): GuestSnapshot {
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

export type { GuestWhatIfGeneration, GuestWhatIfState };
