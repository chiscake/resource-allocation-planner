import type { Model, SolveTrace } from "$lib/domain";
import { engineFail, engineOk, type SolverEngine } from "../../contract";
import { solveLpNative } from "./simplex";

function runNative(model: Model) {
  const { result, frames, dual_frames } = solveLpNative(model);
  const trace: SolveTrace = { method: "lp", frames, dual_frames };
  return { result, trace };
}

/** Native two-phase simplex with full primal/dual tableau traces. */
export const lpNativeEngine: SolverEngine = {
  method: "lp",
  engine: "native",
  solve(model) {
    try {
      const { result, trace } = runNative(model);
      if (!result.feasible) {
        return engineFail("infeasible");
      }
      return engineOk({
        result,
        trace,
        provenance: { method: "lp", engine: "native" },
      });
    } catch (e) {
      return engineFail(e instanceof Error ? e.message : "error");
    }
  },
  solveStreaming(model, onFrame) {
    try {
      const { result, frames, dual_frames } = solveLpNative(model);
      // Emit progressive snapshots: primal frames first, then dual, then final.
      const step = Math.max(1, Math.floor(frames.length / 8));
      for (let i = 0; i < frames.length; i += step) {
        onFrame({
          method: "lp",
          frames: frames.slice(0, i + 1),
          dual_frames: [],
        });
      }
      const dStep = Math.max(1, Math.floor(dual_frames.length / 8));
      for (let i = 0; i < dual_frames.length; i += dStep) {
        onFrame({
          method: "lp",
          frames,
          dual_frames: dual_frames.slice(0, i + 1),
        });
      }
      const trace: SolveTrace = { method: "lp", frames, dual_frames };
      onFrame(trace);
      if (!result.feasible) {
        return engineFail("infeasible");
      }
      return engineOk({
        result,
        trace,
        provenance: { method: "lp", engine: "native" },
      });
    } catch (e) {
      return engineFail(e instanceof Error ? e.message : "error");
    }
  },
};
