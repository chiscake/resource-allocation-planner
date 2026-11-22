import type { ResolvedVenue, SolveEngine, SolveMethod } from '$lib/domain';

/** LP: local → native; cloud one-shot → library@cloud. Other methods: native, venue as requested. */
export function resolveSolveMode(
  method: SolveMethod,
  cloud: boolean,
): { engine: SolveEngine; venue: ResolvedVenue } {
  if (cloud) {
    if (method === 'lp') return { engine: 'library', venue: 'cloud' };
    return { engine: 'native', venue: 'cloud' };
  }
  if (method === 'lp') return { engine: 'native', venue: 'local' };
  return { engine: 'native', venue: 'local' };
}
