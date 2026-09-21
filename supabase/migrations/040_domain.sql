-- 040_domain: templates, solve_nodes, comparisons

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  org_id uuid references public.organizations (id) on delete set null,
  title text not null,
  system_kind text check (system_kind is null or system_kind in ('signup_seed', 'public_repo')),
  model jsonb not null,
  what_if jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.solve_nodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  org_visibility text,
  parent_id uuid references public.solve_nodes (id) on delete cascade,
  kind text not null default 'root',
  title text not null,
  model jsonb not null,
  mutation jsonb,
  result jsonb,
  solver_meta jsonb,
  what_if_generation int,
  is_favorite boolean not null default false,
  deleted_by_org_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint solve_nodes_favorite_root check (is_favorite = false or parent_id is null),
  constraint solve_nodes_org_visibility check (
    (org_id is null and org_visibility is null)
    or (org_id is not null and org_visibility in ('private', 'org'))
  )
);

create index if not exists solve_nodes_owner_idx on public.solve_nodes (owner_id);
create index if not exists solve_nodes_parent_idx on public.solve_nodes (parent_id);
create index if not exists solve_nodes_generation_idx on public.solve_nodes (parent_id, what_if_generation);

create table if not exists public.comparisons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  node_ids uuid[] not null,
  created_at timestamptz not null default now()
);

alter table public.templates enable row level security;
alter table public.solve_nodes enable row level security;
alter table public.comparisons enable row level security;

-- templates
create policy templates_select on public.templates
  for select to authenticated
  using (
    deleted_at is null and (
      public.is_admin()
      or owner_id = auth.uid()
      or system_kind = 'public_repo'
      or system_kind = 'signup_seed'
      or (org_id is not null and public.is_org_member(org_id))
    )
  );

create policy templates_insert on public.templates
  for insert to authenticated
  with check (owner_id = auth.uid() or public.is_admin());

create policy templates_update on public.templates
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin());

create policy templates_delete on public.templates
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- solve_nodes: owner sees all own rows including soft-deleted children
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
    or public.is_admin()
  );

create policy solve_nodes_insert on public.solve_nodes
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy solve_nodes_update on public.solve_nodes
  for update to authenticated
  using (
    owner_id = auth.uid()
    or (
      org_id is not null
      and public.is_org_owner(org_id)
      and org_visibility = 'org'
    )
    or public.is_admin()
  );

create policy solve_nodes_delete on public.solve_nodes
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

create policy comparisons_all on public.comparisons
  for all to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
