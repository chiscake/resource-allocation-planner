import type { SolveEngine, SolveMethod } from "$lib/domain";
import type { SolverEngine } from "./contract";
import { lpLibraryEngine, lpNativeEngine } from "./methods/lp";
import { ipmNativeEngine } from "./methods/ipm";
import { gaNativeEngine } from "./methods/ga";

/** Registered engines. Missing library slot ⇒ calc default falls back to native (Q9a). */
const REGISTRY: Record<
  SolveMethod,
  Partial<Record<SolveEngine, SolverEngine>>
> = {
  lp: {
    library: lpLibraryEngine,
    native: lpNativeEngine,
  },
  ipm: {
    native: ipmNativeEngine,
  },
  ga: {
    native: gaNativeEngine,
  },
};

/**
 * Calc default: LP → native (library used for verify / cloud one-shot).
 * Other methods → library if registered, else native.
 */
export function defaultEngine(method: SolveMethod): SolveEngine {
  if (method === "lp") return "native";
  const slot = REGISTRY[method];
  if (slot.library) return "library";
  return "native";
}

export function availableEngines(method: SolveMethod): SolveEngine[] {
  const slot = REGISTRY[method];
  const out: SolveEngine[] = [];
  if (slot.library) out.push("library");
  if (slot.native) out.push("native");
  return out;
}

export function resolveEngine(
  method: SolveMethod,
  engine?: SolveEngine,
): SolverEngine {
  const want = engine ?? defaultEngine(method);
  const impl = REGISTRY[method][want];
  if (impl) return impl;
  // Requested engine missing → fall back to default for method.
  const fallback = REGISTRY[method][defaultEngine(method)];
  if (fallback) return fallback;
  throw new Error(`no engine registered for ${method}/${want}`);
}
