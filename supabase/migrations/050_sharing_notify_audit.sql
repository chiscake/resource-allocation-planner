-- 050_sharing + notifications + audit (no jsonb payloads)

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.solve_nodes (id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.share_grants (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.solve_nodes (id) on delete cascade,
  grantee_id uuid not null references auth.users (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (node_id, grantee_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  org_id uuid references public.organizations (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  target_user_id uuid references auth.users (id) on delete set null,
  visibility_from text,
  visibility_to text
);

alter table public.share_links enable row level security;
alter table public.share_grants enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;

create policy share_links_owner on public.share_links
  for all to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.solve_nodes n where n.id = node_id and n.owner_id = auth.uid())
    or public.is_admin()
  )
  with check (created_by = auth.uid());

create policy share_grants_parties on public.share_grants
  for all to authenticated
  using (
    created_by = auth.uid()
    or grantee_id = auth.uid()
    or exists (select 1 from public.solve_nodes n where n.id = node_id and n.owner_id = auth.uid())
    or public.is_admin()
  )
  with check (created_by = auth.uid());

create policy notifications_own on public.notifications
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy audit_select on public.audit_events
  for select to authenticated
  using (
    actor_id = auth.uid()
    or (org_id is not null and public.is_org_owner(org_id))
    or public.is_admin()
  );

create policy audit_insert on public.audit_events
  for insert to authenticated
  with check (actor_id = auth.uid() or public.is_admin());
