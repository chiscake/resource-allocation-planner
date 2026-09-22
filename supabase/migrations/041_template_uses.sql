-- 041: track public_repo template uses per user (home «Последние шаблоны»)

create table if not exists public.template_uses (
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid not null references public.templates (id) on delete cascade,
  last_used_at timestamptz not null default now(),
  primary key (user_id, template_id)
);

create index if not exists template_uses_user_used_idx
  on public.template_uses (user_id, last_used_at desc);

alter table public.template_uses enable row level security;

create policy template_uses_select on public.template_uses
  for select to authenticated
  using (user_id = auth.uid());

create policy template_uses_insert on public.template_uses
  for insert to authenticated
  with check (user_id = auth.uid());

create policy template_uses_update on public.template_uses
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy template_uses_delete on public.template_uses
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.template_uses to authenticated;
grant all on public.template_uses to service_role;
