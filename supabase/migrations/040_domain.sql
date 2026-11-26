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

-- Comments on a solve node (revisions = their own node_id)
create table if not exists public.node_comments (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.solve_nodes (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists node_comments_node_idx
  on public.node_comments (node_id, created_at);

alter table public.templates enable row level security;
alter table public.solve_nodes enable row level security;
alter table public.comparisons enable row level security;
alter table public.node_comments enable row level security;

-- templates
-- Owner/admin must SELECT soft-deleted rows so UPDATE … SET deleted_at passes RLS
-- (Postgres also applies SELECT policies to the new row when WHERE/RETURNING is used).
create policy templates_select on public.templates
  for select to authenticated
  using (
    public.is_admin()
    or owner_id = auth.uid()
    or (
      deleted_at is null and (
        system_kind = 'public_repo'
        or system_kind = 'signup_seed'
        or (org_id is not null and public.is_org_member(org_id))
      )
    )
  );

-- Guests (anon key) may browse the public catalog only.
create policy templates_select_anon_public on public.templates
  for select to anon
  using (deleted_at is null and system_kind = 'public_repo');

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

-- node_comments: same visibility as parent solve_node; author edits/deletes own
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
        )
    )
  );

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
          or public.is_admin()
        )
    )
  );

create policy node_comments_update on public.node_comments
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy node_comments_delete on public.node_comments
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());
