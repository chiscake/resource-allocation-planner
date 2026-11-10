-- 011: app role helpers for moderator

create or replace function public.is_mod()
returns boolean
language sql
stable
as $$
  select public.jwt_role() = 'mod';
$$;

create or replace function public.is_admin_or_mod()
returns boolean
language sql
stable
as $$
  select public.jwt_role() in ('admin', 'mod');
$$;
