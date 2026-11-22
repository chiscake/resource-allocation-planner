-- Root pointer: which what_if_generation is «current» (null = no current sensitivity pack).
-- Base snapshots live as solve_nodes kind='what_if_base' (app convention; no kind CHECK).
alter table public.solve_nodes
add column if not exists active_what_if_generation int;

comment on column public.solve_nodes.active_what_if_generation is 'Root only: active what_if_generation; null means current step has no sensitivity pack';