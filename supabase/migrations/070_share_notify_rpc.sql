-- 070: share public read + notifications insert + shared-node RPC + notify_user
-- (was 070–073; merged — local reset only, no cloud migrate of old chain)

-- Public read of non-revoked share links for /share/[token]
-- NOTE: do NOT add a solve_nodes policy that reads share_links (RLS recursion).
-- Node payload is exposed via get_shared_node() below.

create policy share_links_public_select on public.share_links
  for select to anon, authenticated
  using (revoked_at is null);

-- Allow creating notifications for other users (share / org-owner delete)

drop policy if exists notifications_own on public.notifications;

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.solve_nodes n
      where n.id = entity_id and n.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.solve_nodes n
      join public.organization_members m on m.org_id = n.org_id
      where n.id = entity_id
        and m.user_id = auth.uid()
        and m.role = 'org_owner'
    )
  );

-- Fix infinite recursion: solve_nodes <-> share_links policies

drop policy if exists solve_nodes_share_select on public.solve_nodes;

create or replace function public.get_shared_node(p_token text)
returns table (title text, result jsonb)
language sql
security definer
set search_path = public
as $$
  select n.title, n.result
  from public.share_links sl
  join public.solve_nodes n on n.id = sl.node_id
  where sl.token = p_token
    and sl.revoked_at is null
  limit 1;
$$;

grant execute on function public.get_shared_node(text) to anon, authenticated;

-- Allow authenticated users to notify another user (share / org delete)

create or replace function public.notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
  values (p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id)
  returning id into nid;
  return nid;
end;
$$;

grant execute on function public.notify_user(uuid, text, text, text, text, uuid) to authenticated;
