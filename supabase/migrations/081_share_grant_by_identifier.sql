-- 081: share_grant_by_identifier — grant by email or user UUID (de-identified ok)

create or replace function public.share_grant_by_identifier(
  p_node_id uuid,
  p_identifier text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_ident text := trim(both from coalesce(p_identifier, ''));
  v_grantee uuid;
  v_title text;
  v_org_id uuid;
  v_existing_id uuid;
  v_existing_revoked timestamptz;
  v_should_notify boolean := false;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if v_ident = '' then
    raise exception 'invalid_identifier';
  end if;

  select n.title, n.org_id
    into v_title, v_org_id
  from public.solve_nodes n
  where n.id = p_node_id
    and n.owner_id = v_actor
    and n.deleted_at is null
    and n.kind = 'root';

  if not found then
    raise exception 'forbidden';
  end if;

  if v_ident ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id into v_grantee
    from auth.users u
    where u.id = v_ident::uuid;
  elsif v_ident ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    select u.id into v_grantee
    from auth.users u
    where lower(u.email) = lower(v_ident);
  else
    raise exception 'invalid_identifier';
  end if;

  if v_grantee is not null and v_grantee = v_actor then
    raise exception 'self_grant';
  end if;

  -- Unknown user: same opaque ok (anti-enumeration)
  if v_grantee is null then
    return jsonb_build_object('ok', true);
  end if;

  select g.id, g.revoked_at
    into v_existing_id, v_existing_revoked
  from public.share_grants g
  where g.node_id = p_node_id
    and g.grantee_id = v_grantee;

  if v_existing_id is null then
    insert into public.share_grants (node_id, grantee_id, created_by)
    values (p_node_id, v_grantee, v_actor);
    v_should_notify := true;
  elsif v_existing_revoked is not null then
    update public.share_grants
    set revoked_at = null
    where id = v_existing_id;
    v_should_notify := true;
  end if;

  if v_should_notify then
    insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
    values (
      v_grantee,
      'share_incoming',
      'Вам открыли доступ к задаче',
      v_title,
      'solve_node',
      p_node_id
    );

    insert into public.audit_events (
      actor_id,
      org_id,
      action,
      entity_type,
      entity_id,
      target_user_id
    )
    values (
      v_actor,
      v_org_id,
      'share_grant',
      'solve_node',
      p_node_id,
      v_grantee
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.share_grant_by_identifier(uuid, text) to authenticated;
