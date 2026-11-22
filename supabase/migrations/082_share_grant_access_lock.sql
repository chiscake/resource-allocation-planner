-- 082: in-app share access — grantee SELECT (no RLS recursion), soft-lock while shared,
-- profiles readable for comment names, comments ACL + bulk delete for owner.

-- Grantee SELECT helper: SECURITY DEFINER so solve_nodes policies can check grants
-- without re-entering solve_nodes RLS via share_grants.
create or replace function public.has_share_grant_access(p_id uuid, p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.share_grants g
    where g.grantee_id = auth.uid()
      and g.revoked_at is null
      and g.node_id = coalesce(p_parent_id, p_id)
  );
$$;

revoke all on function public.has_share_grant_access(uuid, uuid) from public;
grant execute on function public.has_share_grant_access(uuid, uuid) to authenticated;

drop policy if exists solve_nodes_select on public.solve_nodes;

create policy solve_nodes_select on public.solve_nodes
  for select to authenticated
  using (
    owner_id = auth.uid()
    or (
      deleted_at is null
      and org_id is not null
      and org_visibility = 'org'
      and public.is_org_member(org_id)
    )
    or (
      deleted_at is null
      and public.has_share_grant_access(id, parent_id)
    )
    or public.is_admin()
  );

-- Only the node owner may create/revoke share rows (RPC share_grant_by_identifier is SECURITY DEFINER).
drop policy if exists share_links_owner on public.share_links;

create policy share_links_owner on public.share_links
  for all to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.solve_nodes n where n.id = node_id and n.owner_id = auth.uid())
    or public.is_admin()
  )
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.solve_nodes n
      where n.id = node_id
        and n.owner_id = auth.uid()
        and n.deleted_at is null
    )
  );

drop policy if exists share_grants_parties on public.share_grants;

create policy share_grants_parties on public.share_grants
  for all to authenticated
  using (
    created_by = auth.uid()
    or grantee_id = auth.uid()
    or exists (select 1 from public.solve_nodes n where n.id = node_id and n.owner_id = auth.uid())
    or public.is_admin()
  )
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.solve_nodes n
      where n.id = node_id
        and n.owner_id = auth.uid()
        and n.deleted_at is null
    )
  );

-- Comments visible to grantees of the parent node (same helper; no extra recursion).
drop policy if exists node_comments_select on public.node_comments;

create policy node_comments_select on public.node_comments
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.solve_nodes n
      where n.id = node_id
        and (
          n.owner_id = auth.uid()
          or (
            n.deleted_at is null
            and n.org_id is not null
            and n.org_visibility = 'org'
            and public.is_org_member(n.org_id)
          )
          or (
            n.deleted_at is null
            and public.has_share_grant_access(n.id, n.parent_id)
          )
        )
    )
  );

-- Soft-lock while any share channel is active.
create or replace function public.node_has_active_share(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.share_links sl
    where sl.node_id = p_node_id and sl.revoked_at is null
  )
  or exists (
    select 1 from public.share_grants sg
    where sg.node_id = p_node_id and sg.revoked_at is null
  );
$$;

revoke all on function public.node_has_active_share(uuid) from public;
grant execute on function public.node_has_active_share(uuid) to authenticated;

-- While shared, only trash-related columns may change (admin bypass).
create or replace function public.solve_nodes_block_content_while_shared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if not public.node_has_active_share(old.id) then
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
    or new.org_id is distinct from old.org_id
    or new.org_visibility is distinct from old.org_visibility
    or new.parent_id is distinct from old.parent_id
    or new.kind is distinct from old.kind
    or new.title is distinct from old.title
    or new.model is distinct from old.model
    or new.mutation is distinct from old.mutation
    or new.result is distinct from old.result
    or new.solver_meta is distinct from old.solver_meta
    or new.what_if_generation is distinct from old.what_if_generation
    or new.active_what_if_generation is distinct from old.active_what_if_generation
    or new.is_favorite is distinct from old.is_favorite
  then
    raise exception 'node_locked_while_shared';
  end if;

  return new;
end;
$$;

drop trigger if exists solve_nodes_lock_while_shared on public.solve_nodes;
create trigger solve_nodes_lock_while_shared
  before update on public.solve_nodes
  for each row
  execute function public.solve_nodes_block_content_while_shared();

-- Comment author labels: authenticated may read profiles (pre-prod; client selects id + display_name only).
drop policy if exists profiles_select_own on public.profiles;

create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (true);

-- Grantee may insert comments on shared nodes.
drop policy if exists node_comments_insert on public.node_comments;

create policy node_comments_insert on public.node_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.solve_nodes n
      where n.id = node_id
        and n.deleted_at is null
        and (
          n.owner_id = auth.uid()
          or (
            n.org_id is not null
            and n.org_visibility = 'org'
            and public.is_org_member(n.org_id)
          )
          or public.has_share_grant_access(n.id, n.parent_id)
          or public.is_admin()
        )
    )
  );

-- Author, node owner, or admin may delete.
drop policy if exists node_comments_delete on public.node_comments;

create policy node_comments_delete on public.node_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.solve_nodes n
      where n.id = node_id and n.owner_id = auth.uid()
    )
  );

-- Bulk delete all comments on a node (owner or admin).
create or replace function public.delete_node_comments(
  p_node_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count integer;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_admin()
    and not exists (
      select 1 from public.solve_nodes n
      where n.id = p_node_id and n.owner_id = v_actor
    )
  then
    raise exception 'forbidden';
  end if;

  delete from public.node_comments
  where node_id = p_node_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.delete_node_comments(uuid) from public;
grant execute on function public.delete_node_comments(uuid) to authenticated;
