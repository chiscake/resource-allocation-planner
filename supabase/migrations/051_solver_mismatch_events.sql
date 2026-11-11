-- 051: log native vs library LP mismatches (narrow columns, no jsonb)

create table if not exists public.solver_mismatch_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  solve_node_id uuid references public.solve_nodes (id) on delete set null,
  method text not null default 'lp',
  label text not null default 'root',
  native_z double precision,
  library_z double precision,
  max_abs_dx double precision
);

create index if not exists solver_mismatch_events_actor_idx
  on public.solver_mismatch_events (actor_id, created_at desc);
create index if not exists solver_mismatch_events_node_idx
  on public.solver_mismatch_events (solve_node_id);

alter table public.solver_mismatch_events enable row level security;

create policy solver_mismatch_select on public.solver_mismatch_events
  for select to authenticated
  using (actor_id = auth.uid() or public.is_admin());

create policy solver_mismatch_insert on public.solver_mismatch_events
  for insert to authenticated
  with check (actor_id = auth.uid() or public.is_admin());
