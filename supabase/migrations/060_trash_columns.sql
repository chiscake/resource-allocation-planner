-- 060_trash: columns already on solve_nodes/templates; index helpers only (pg_cron = P4)

create index if not exists solve_nodes_deleted_idx on public.solve_nodes (deleted_at)
  where deleted_at is not null;

create index if not exists templates_deleted_idx on public.templates (deleted_at)
  where deleted_at is not null;

comment on column public.solve_nodes.deleted_at is 'Soft-delete; hard purge via pg_cron after 30 days (P4)';
comment on column public.solve_nodes.deleted_by_org_owner is 'True when org_owner soft-deleted another member node';
