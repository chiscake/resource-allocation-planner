import type {
  Model,
  Mutation,
  MutationRunItem,
  SolveMethod,
  SolveResponse,
  SolveResult,
} from "$lib/domain";
import { solveLocal } from "./run";
import { runMutationsLocal } from "./mutations";

export const VERIFY_EPS = 1e-6;

export type VerifyDiff = {
  match: boolean;
  dZ: number;
  maxAbsDx: number;
};

/** Compare raw (pre–display-round) results. */
export function compareSolveResults(
  native: SolveResult,
  library: SolveResult,
  eps = VERIFY_EPS,
): VerifyDiff {
  const dZ = Math.abs(native.Z - library.Z);
  let maxAbsDx = 0;
  const keys = new Set([...Object.keys(native.x), ...Object.keys(library.x)]);
  for (const k of keys) {
    maxAbsDx = Math.max(
      maxAbsDx,
      Math.abs((native.x[k] ?? 0) - (library.x[k] ?? 0)),
    );
  }
  return {
    match: dZ <= eps && maxAbsDx <= eps,
    dZ,
    maxAbsDx,
  };
}

export type VerifyItemReport = {
  label: string;
  native: SolveResponse;
  library: SolveResponse;
  diff: VerifyDiff;
};

export type VerifyReport = {
  root: VerifyItemReport | null;
  items: VerifyItemReport[];
  anyMismatch: boolean;
};

export function verifyAgainstLibrary(
  model: Model,
  nativeRoot: SolveResponse,
  method: SolveMethod,
  mutationItems?: MutationRunItem[],
): VerifyReport {
  const items: VerifyItemReport[] = [];
  let root: VerifyItemReport | null = null;

  if (method === "lp" && nativeRoot.status === "done" && nativeRoot.result) {
    const library = solveLocal(model, "local", 0, "lp", "library");
    if (library.status === "done" && library.result) {
      const diff = compareSolveResults(nativeRoot.result, library.result);
      root = {
        label: "root",
        native: nativeRoot,
        library,
        diff,
      };
    }
  }

  if (method === "lp" && mutationItems && mutationItems.length > 0) {
    const mutations: Mutation[] = mutationItems.map((i) => i.mutation);
    const pack = runMutationsLocal(model, mutations, "local", "lp", "library");
    for (let i = 0; i < mutationItems.length; i++) {
      const nat = mutationItems[i];
      const lib = pack.items[i];
      if (
        !nat?.response.result ||
        !lib?.response.result ||
        nat.response.status !== "done" ||
        lib.response.status !== "done"
      ) {
        continue;
      }
      const diff = compareSolveResults(nat.response.result, lib.response.result);
      items.push({
        label: nat.mutation.label ?? nat.mutation.kind,
        native: nat.response,
        library: lib.response,
        diff,
      });
    }
  }

  const anyMismatch =
    (root != null && !root.diff.match) || items.some((i) => !i.diff.match);

  return { root, items, anyMismatch };
}
