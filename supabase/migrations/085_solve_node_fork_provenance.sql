-- 085: fork provenance + source snapshot on solve_nodes (lineage graph)

alter table public.solve_nodes
  add column if not exists forked_from_id uuid references public.solve_nodes (id) on delete set null,
  add column if not exists fork_kind text,
  add column if not exists fork_source_title text,
  add column if not exists fork_source_z double precision;

alter table public.solve_nodes
  drop constraint if exists solve_nodes_fork_kind_check;

alter table public.solve_nodes
  add constraint solve_nodes_fork_kind_check
  check (fork_kind is null or fork_kind in ('task', 'mutation'));

alter table public.solve_nodes
  drop constraint if exists solve_nodes_fork_pair_check;

alter table public.solve_nodes
  add constraint solve_nodes_fork_pair_check
  check (
    (forked_from_id is null and fork_kind is null)
    or (forked_from_id is not null and fork_kind is not null)
  );

create index if not exists solve_nodes_forked_from_idx
  on public.solve_nodes (forked_from_id);
