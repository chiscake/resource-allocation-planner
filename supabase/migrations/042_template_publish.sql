-- 042: public template publish workflow + moderation RPCs

alter table public.templates
  add column if not exists publish_status text;

-- Backfill existing catalog rows before CHECK
update public.templates
set publish_status = 'approved'
where system_kind = 'public_repo'
  and publish_status is null
  and deleted_at is null;

alter table public.templates
  drop constraint if exists templates_publish_status_check;

alter table public.templates
  add constraint templates_publish_status_check
  check (publish_status is null or publish_status in ('pending', 'approved'));

alter table public.templates
  drop constraint if exists templates_publish_invariant;

alter table public.templates
  add constraint templates_publish_invariant check (
    (system_kind is null and publish_status is null)
    or (system_kind is null and publish_status = 'pending' and owner_id is not null)
    or (system_kind = 'public_repo' and publish_status = 'approved')
    or (system_kind = 'signup_seed' and publish_status is null)
  );

create index if not exists templates_publish_status_idx
  on public.templates (publish_status)
  where deleted_at is null;

-- RLS: catalog only when approved; mods see pending; owners keep own rows
drop policy if exists templates_select on public.templates;
create policy templates_select on public.templates
  for select to authenticated
  using (
    deleted_at is null and (
      public.is_admin()
      or owner_id = auth.uid()
      or (system_kind = 'public_repo' and publish_status = 'approved')
      or system_kind = 'signup_seed'
      or (public.is_mod() and publish_status = 'pending')
      or (org_id is not null and public.is_org_member(org_id))
    )
  );

drop policy if exists templates_select_anon_public on public.templates;
create policy templates_select_anon_public on public.templates
  for select to anon
  using (
    deleted_at is null
    and system_kind = 'public_repo'
    and publish_status = 'approved'
  );

drop policy if exists templates_insert on public.templates;
create policy templates_insert on public.templates
  for insert to authenticated
  with check (owner_id = auth.uid() or public.is_admin_or_mod());

-- Owners may edit personal / pending only; approved changes go through RPCs
drop policy if exists templates_update on public.templates;
create policy templates_update on public.templates
  for update to authenticated
  using (
    public.is_admin_or_mod()
    or (
      owner_id = auth.uid()
      and system_kind is null
      and (publish_status is null or publish_status = 'pending')
    )
  )
  with check (
    public.is_admin_or_mod()
    or (
      owner_id = auth.uid()
      and system_kind is null
      and (publish_status is null or publish_status = 'pending')
    )
  );

drop policy if exists templates_delete on public.templates;
create policy templates_delete on public.templates
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin_or_mod());

-- ---------------------------------------------------------------------------
-- Internal helpers (security definer)
-- ---------------------------------------------------------------------------

create or replace function public._template_audit(
  p_action text,
  p_entity_id uuid,
  p_target_user_id uuid default null,
  p_visibility_from text default null,
  p_visibility_to text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.audit_events (
    actor_id, action, entity_type, entity_id, target_user_id, visibility_from, visibility_to
  ) values (
    auth.uid(), p_action, 'template', p_entity_id, p_target_user_id, p_visibility_from, p_visibility_to
  );
end;
$$;

create or replace function public._notify_admins_mods(
  p_type text,
  p_title text,
  p_body text,
  p_entity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from public.profiles where role in ('admin', 'mod')
  loop
    insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
    values (r.id, p_type, p_title, p_body, 'template', p_entity_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.request_template_publish(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.templates%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into t from public.templates where id = p_id for update;
  if not found or t.deleted_at is not null then
    raise exception 'template not found';
  end if;
  if t.owner_id is distinct from auth.uid() then
    raise exception 'not owner';
  end if;
  if t.system_kind is not null or t.publish_status is not null then
    raise exception 'template not eligible for publish request';
  end if;

  update public.templates
  set publish_status = 'pending', updated_at = now()
  where id = p_id;

  perform public._notify_admins_mods(
    'template_publish_pending',
    'Заявка на публикацию шаблона',
    t.title,
    p_id
  );
  perform public._template_audit('template_publish_request', p_id, null, null, 'pending');
end;
$$;

create or replace function public.withdraw_template_publish(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.templates%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into t from public.templates where id = p_id for update;
  if not found or t.deleted_at is not null then
    raise exception 'template not found';
  end if;
  if t.owner_id is distinct from auth.uid() then
    raise exception 'not owner';
  end if;
  if t.publish_status is distinct from 'pending' or t.system_kind is not null then
    raise exception 'template is not pending';
  end if;

  update public.templates
  set publish_status = null, updated_at = now()
  where id = p_id;

  perform public._template_audit('template_publish_withdraw', p_id, null, 'pending', null);
end;
$$;

create or replace function public.unpublish_template(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.templates%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into t from public.templates where id = p_id for update;
  if not found or t.deleted_at is not null then
    raise exception 'template not found';
  end if;
  if t.system_kind is distinct from 'public_repo' or t.publish_status is distinct from 'approved' then
    raise exception 'template is not published';
  end if;
  if t.owner_id is null then
    raise exception 'platform template cannot be unpublished; soft-delete instead';
  end if;
  if t.owner_id is distinct from auth.uid() and not public.is_admin_or_mod() then
    raise exception 'forbidden';
  end if;

  update public.templates
  set system_kind = null, publish_status = null, updated_at = now()
  where id = p_id;

  perform public._template_audit(
    'template_unpublish',
    p_id,
    t.owner_id,
    'approved',
    null
  );
end;
$$;

create or replace function public.moderate_template_publish(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.templates%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_admin_or_mod() then
    raise exception 'forbidden';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'invalid action';
  end if;

  select * into t from public.templates where id = p_id for update;
  if not found or t.deleted_at is not null then
    raise exception 'template not found';
  end if;
  if t.publish_status is distinct from 'pending' or t.system_kind is not null then
    raise exception 'template is not pending';
  end if;

  if p_action = 'approve' then
    update public.templates
    set system_kind = 'public_repo', publish_status = 'approved', updated_at = now()
    where id = p_id;

    insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
    values (
      t.owner_id,
      'template_publish_approved',
      'Шаблон опубликован',
      t.title,
      'template',
      p_id
    );
    perform public._template_audit('template_publish_approve', p_id, t.owner_id, 'pending', 'approved');
  else
    update public.templates
    set publish_status = null, updated_at = now()
    where id = p_id;

    insert into public.notifications (user_id, type, title, body, entity_type, entity_id)
    values (
      t.owner_id,
      'template_publish_rejected',
      'Публикация шаблона отклонена',
      t.title,
      'template',
      p_id
    );
    perform public._template_audit('template_publish_reject', p_id, t.owner_id, 'pending', null);
  end if;
end;
$$;

create or replace function public.publish_template_direct(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.templates%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_admin_or_mod() then
    raise exception 'forbidden';
  end if;

  select * into t from public.templates where id = p_id for update;
  if not found or t.deleted_at is not null then
    raise exception 'template not found';
  end if;
  if t.owner_id is distinct from auth.uid() then
    raise exception 'can only publish own personal template directly';
  end if;
  if t.system_kind is not null or t.publish_status is not null then
    raise exception 'template not eligible for direct publish';
  end if;

  update public.templates
  set system_kind = 'public_repo', publish_status = 'approved', updated_at = now()
  where id = p_id;

  perform public._template_audit('template_publish_direct', p_id, t.owner_id, null, 'approved');
end;
$$;

grant execute on function public.request_template_publish(uuid) to authenticated;
grant execute on function public.withdraw_template_publish(uuid) to authenticated;
grant execute on function public.unpublish_template(uuid) to authenticated;
grant execute on function public.moderate_template_publish(uuid, text) to authenticated;
grant execute on function public.publish_template_direct(uuid) to authenticated;
