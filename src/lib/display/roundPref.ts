const PREF_KEY = "rap_round_plan";

/** Session/device preference for integer plan display (UI-only; not in model schema). */
export function getRoundPlanPreference(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(PREF_KEY) === "1";
}

export function setRoundPlanPreference(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PREF_KEY, enabled ? "1" : "0");
}
