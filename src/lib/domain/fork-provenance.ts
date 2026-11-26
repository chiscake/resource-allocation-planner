/** Fork provenance fields written on a new root solve_node. */

export type ForkKind = 'task' | 'mutation';

export type ForkProvenanceFields = {
  forked_from_id: string;
  fork_kind: ForkKind;
  fork_source_title: string;
  fork_source_z: number | null;
};

export function resultZ(result: { Z?: number } | null | undefined): number | null {
  if (!result || typeof result.Z !== 'number' || !Number.isFinite(result.Z)) return null;
  return result.Z;
}

/** Compose mutation tooltip / snapshot title: `{task} · {mutation}`. */
export function mutationForkTitle(taskTitle: string, mutationTitle: string): string {
  return `${taskTitle} · ${mutationTitle}`;
}

export function taskForkProvenance(
  sourceRootId: string,
  sourceTitle: string,
  sourceResult: { Z?: number } | null | undefined,
): ForkProvenanceFields {
  return {
    forked_from_id: sourceRootId,
    fork_kind: 'task',
    fork_source_title: sourceTitle,
    fork_source_z: resultZ(sourceResult),
  };
}

export function mutationForkProvenance(
  sensitivityId: string,
  taskTitle: string,
  mutationTitle: string,
  sourceResult: { Z?: number } | null | undefined,
): ForkProvenanceFields {
  return {
    forked_from_id: sensitivityId,
    fork_kind: 'mutation',
    fork_source_title: mutationForkTitle(taskTitle, mutationTitle),
    fork_source_z: resultZ(sourceResult),
  };
}
