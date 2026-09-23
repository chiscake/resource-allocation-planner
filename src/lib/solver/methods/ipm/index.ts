import { engineFail, engineOk, type SolverEngine } from "../../contract";
import { solveIpmModel } from "./native";

export { solveIpmModel, solveIpmRaw } from "./native";
export type { IpmRaw } from "./native";

export const ipmNativeEngine: SolverEngine = {
  method: "ipm",
  engine: "native",
  solve(model) {
    const result = solveIpmModel(model);
    if (!result) return engineFail("ipm_failed");
    return engineOk({ result });
  },
};
