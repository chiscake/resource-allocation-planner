import type {
  Model,
  SolveEngine,
  SolveMethod,
  SolveResponse,
  SolveRunOptions,
  SolveRunProvenance,
  SolveTrace,
} from '$lib/domain';
import { solveLocal } from './run';
import { runConfigToHyper } from './methods/ga/presets';

/**
 * Regenerate an in-memory trace from a saved result + provenance.
 * Used by «Подробнее» after fork / page reload when trace was not persisted.
 */
export function regenerateTrace(
  model: Model,
  provenance: SolveRunProvenance | undefined,
  method: SolveMethod,
  engine: SolveEngine = 'native',
): { response: SolveResponse; trace: SolveTrace | null } {
  const options: SolveRunOptions | undefined =
    provenance?.method === 'ga'
      ? { ga: provenance.config }
      : provenance?.method === 'dln'
        ? { dln: provenance.config }
        : undefined;

  const response = solveLocal(model, 'local', 0, method, engine, options);
  return { response, trace: response.trace ?? null };
}

/** Build SolveRunOptions from session GA settings. */
export function gaOptionsFromConfig(
  config: SolveRunOptions['ga'] | undefined,
): SolveRunOptions | undefined {
  if (!config) return undefined;
  return { ga: { ...runConfigToHyper(config), ...config } };
}
