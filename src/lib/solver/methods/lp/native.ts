import type { SolveTrace } from "$lib/domain";
import { engineFail, type SolverEngine } from "../../contract";

/** Native simplex stub — full tableau frames land in a later PR. */
export const lpNativeEngine: SolverEngine = {
  method: "lp",
  engine: "native",
  solve() {
    return engineFail("not_implemented", "use_library");
  },
  solveStreaming(_model, onFrame) {
    const empty: SolveTrace = { method: "lp", frames: [] };
    onFrame(empty);
    return engineFail("not_implemented", "use_library");
  },
};
