import { supabase } from './supabase';

export type MismatchRow = {
  solve_node_id?: string | null;
  method?: string;
  label: string;
  native_z: number | null;
  library_z: number | null;
  max_abs_dx: number | null;
};

/** Persist mismatch rows (authenticated). Guest: no-op. */
export async function logSolverMismatches(rows: MismatchRow[]): Promise<void> {
  if (rows.length === 0) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const payload = rows.map((r) => ({
    actor_id: user.id,
    solve_node_id: r.solve_node_id ?? null,
    method: r.method ?? 'lp',
    label: r.label,
    native_z: r.native_z,
    library_z: r.library_z,
    max_abs_dx: r.max_abs_dx,
  }));
  const { error } = await supabase.from('solver_mismatch_events').insert(payload);
  if (error) {
    console.warn('[solver_mismatch] insert failed', error.message);
  }
}
