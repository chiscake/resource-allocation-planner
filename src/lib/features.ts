/**
 * Public UI feature flags (`PUBLIC_*` from the Vite env file).
 * These gate presentation only — solver/Edge contracts stay available.
 */

function parsePublicBool(flag: string | undefined): boolean | null {
  const v = (flag ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  return null;
}

/**
 * `PUBLIC_SHOW_DLN` — show DLN in method tabs and method comparison.
 * Unset → hidden. Solve/Edge still accept `method: "dln"`.
 */
export function isDlnUiEnabled(flag: string | undefined): boolean {
  return parsePublicBool(flag) === true;
}
