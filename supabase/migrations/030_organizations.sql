-- 030_organizations + membership helpers

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('org_owner', 'member')),
  primary key (org_id, user_id)
);

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_owner(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = auth.uid() and m.role = 'org_owner'
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

create policy orgs_select_member on public.organizations
  for select to authenticated
  using (public.is_org_member(id) or public.is_admin());

create policy orgs_insert_auth on public.organizations
  for insert to authenticated
  with check (auth.uid() is not null);

create policy org_members_select on public.organization_members
  for select to authenticated
  using (public.is_org_member(org_id) or user_id = auth.uid() or public.is_admin());

create policy org_members_insert on public.organization_members
  for insert to authenticated
  with check (public.is_org_owner(org_id) or public.is_admin() or user_id = auth.uid());

create policy org_members_update on public.organization_members
  for update to authenticated
  using (public.is_org_owner(org_id) or public.is_admin());

create policy org_members_delete on public.organization_members
  for delete to authenticated
  using (public.is_org_owner(org_id) or public.is_admin());
