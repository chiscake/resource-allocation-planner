-- 084: device_sessions — client presence for signed-in devices + reconcile orphans

create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  auth_session_id uuid not null,
  platform text not null check (platform in ('web', 'tauri')),
  os_family text not null check (
    os_family in ('windows', 'macos', 'linux', 'android', 'ios', 'other')
  ),
  label text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, auth_session_id)
);

create index if not exists device_sessions_user_last_seen_idx
  on public.device_sessions (user_id, last_seen_at desc);

alter table public.device_sessions enable row level security;

create policy device_sessions_own on public.device_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Drop rows whose auth session no longer exists (caller only).
create or replace function public.reconcile_device_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.device_sessions d
  where d.user_id = v_uid
    and not exists (
      select 1 from auth.sessions s where s.id = d.auth_session_id
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.reconcile_device_sessions() from public;
grant execute on function public.reconcile_device_sessions() to authenticated;

-- Service-role only: revoke one auth session + presence row + audit.
create or replace function public.admin_revoke_device_session(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_current_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_auth_session_id is null then
    raise exception 'invalid_args';
  end if;

  if p_current_session_id is not null and p_auth_session_id = p_current_session_id then
    raise exception 'cannot_revoke_current';
  end if;

  if not exists (
    select 1
    from auth.sessions s
    where s.id = p_auth_session_id
      and s.user_id = p_user_id
  ) and not exists (
    select 1
    from public.device_sessions d
    where d.auth_session_id = p_auth_session_id
      and d.user_id = p_user_id
  ) then
    raise exception 'session_not_found';
  end if;

  delete from auth.sessions
  where id = p_auth_session_id
    and user_id = p_user_id;

  delete from public.device_sessions
  where auth_session_id = p_auth_session_id
    and user_id = p_user_id;

  insert into public.audit_events (
    actor_id, action, entity_type, entity_id, target_user_id
  ) values (
    p_user_id,
    'session_revoke',
    'device_sessions',
    p_auth_session_id,
    p_user_id
  );
end;
$$;

revoke all on function public.admin_revoke_device_session(uuid, uuid, uuid) from public;
grant execute on function public.admin_revoke_device_session(uuid, uuid, uuid) to service_role;
