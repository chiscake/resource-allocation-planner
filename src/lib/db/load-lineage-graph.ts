import {
  buildLineageGraph,
  KIND_SENSITIVITY,
  type LineageGraph,
  type LineageSolveRow,
} from '$lib/domain';
import { supabase } from '$lib/db/supabase';

const ROOT_SELECT =
  'id, owner_id, parent_id, kind, title, model, result, mutation, deleted_at, forked_from_id, fork_kind, fork_source_title, fork_source_z';

const CHILD_SELECT = 'id, owner_id, parent_id, kind, title, model, result, mutation, deleted_at';

/**
 * Load lineage graph for the signed-in user (own roots + live sensitivity + fork sources).
 */
export async function loadLineageGraphForUser(userId: string): Promise<LineageGraph> {
  const { data: roots, error: rootErr } = await supabase
    .from('solve_nodes')
    .select(ROOT_SELECT)
    .eq('owner_id', userId)
    .is('parent_id', null)
    .is('deleted_at', null);

  if (rootErr) throw new Error(rootErr.message);

  const myRoots = (roots ?? []) as LineageSolveRow[];
  const rootIds = myRoots.map((r) => r.id);

  let mySensitivity: LineageSolveRow[] = [];
  if (rootIds.length) {
    const { data: kids, error: kidErr } = await supabase
      .from('solve_nodes')
      .select(CHILD_SELECT)
      .in('parent_id', rootIds)
      .eq('kind', KIND_SENSITIVITY)
      .is('deleted_at', null);
    if (kidErr) throw new Error(kidErr.message);
    mySensitivity = (kids ?? []) as LineageSolveRow[];
  }

  const sourceIds = [
    ...new Set(
      myRoots
        .map((r) => r.forked_from_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  let fetchedSources: LineageSolveRow[] = [];
  if (sourceIds.length) {
    const { data: sources } = await supabase
      .from('solve_nodes')
      .select(ROOT_SELECT)
      .in('id', sourceIds);
    // Partial RLS: missing rows become synthetics in buildLineageGraph.
    fetchedSources = (sources ?? []) as LineageSolveRow[];
  }

  return buildLineageGraph({
    myUserId: userId,
    myRoots,
    mySensitivity,
    fetchedSources,
  });
}
