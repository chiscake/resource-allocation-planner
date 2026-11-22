import {
  applyMutation,
  buildInteractiveMutation,
  buildWhatIfRowData,
  interactiveAutoPreview,
  type Model,
  type MutationKind,
  type SolveMethod,
  type SolveResult,
  type SolverMeta,
  type WhatIfRowData,
} from "$lib/domain";
import type { SolveTransport, SolveTransportOpts } from "./solve-session.svelte";

/** Preview row plus solve artifacts for persist / create-task. */
export type InteractiveScenarioPayload = {
  row: WhatIfRowData;
  result: SolveResult | null;
  solver_meta: SolverMeta | null;
};

export type InteractivePreviewRun = InteractiveScenarioPayload & {
  responseStatus: string;
  rejectedReason?: string | null;
};

/**
 * Run one interactive preview: applyMutation → transport.solve → WhatIfRowData.
 * Does not touch the main session model/result.
 */
export async function runInteractivePreview(input: {
  baseModel: Model;
  baseResult: SolveResult | null | undefined;
  kind: MutationKind;
  target: string;
  deltaPct: number;
  method: SolveMethod;
  transport: SolveTransport;
  transportOpts?: SolveTransportOpts;
}): Promise<InteractivePreviewRun> {
  const mutation = buildInteractiveMutation(
    input.kind,
    input.target,
    input.deltaPct,
    input.baseModel,
  );
  const mutatedModel = applyMutation(input.baseModel, mutation);
  const response = await input.transport.solve(
    mutatedModel,
    input.method,
    input.transportOpts,
  );
  const row = buildWhatIfRowData({
    base: input.baseModel,
    baseResult: input.baseResult,
    mutation,
    mutatedModel,
    result: response.result ?? null,
  });
  return {
    row,
    result: response.result ?? null,
    solver_meta: response.solver_meta ?? null,
    responseStatus: response.status,
    rejectedReason: response.solver_meta.rejected_reason ?? null,
  };
}

export function shouldAutoPreview(method: SolveMethod): boolean {
  return interactiveAutoPreview(method);
}
