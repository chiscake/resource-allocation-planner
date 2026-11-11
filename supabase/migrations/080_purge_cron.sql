-- 080_purge_cron: hard-delete soft-deleted nodes after 30 days (pg_cron on cloud)

create extension if not exists pg_cron with schema extensions;

create or replace function public.purge_soft_deleted_nodes()
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  deleted_count bigint;
begin
  with doomed as (
    delete from public.solve_nodes
    where deleted_at is not null
      and deleted_at < now() - interval '30 days'
    returning id
  )
  select count(*) into deleted_count from doomed;
  return deleted_count;
end;
$fn$;

grant execute on function public.purge_soft_deleted_nodes() to service_role;

comment on function public.purge_soft_deleted_nodes() is
  'Hard-delete solve_nodes soft-deleted >30 days ago; children cascade via parent_id FK.';

-- Schedule daily at 03:00 UTC; skip silently when pg_cron is missing (local dev).
do $outer$
begin
  begin
    perform cron.unschedule('purge_soft_deleted_nodes_daily');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'purge_soft_deleted_nodes_daily',
    '0 3 * * *',
    $job$select public.purge_soft_deleted_nodes();$job$
  );
exception
  when undefined_object then
    raise notice 'pg_cron not available; purge_soft_deleted_nodes() created but not scheduled';
  when others then
    raise notice 'pg_cron schedule failed: %', sqlerrm;
end;
$outer$;
