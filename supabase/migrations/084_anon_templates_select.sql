-- 084: anon needs table SELECT for public catalog (RLS alone is not enough).
-- Root cause: 061 granted DML to authenticated / service_role only; guests use the anon key.
-- Policy templates_select_anon_public already restricts rows to approved public_repo.

grant select on public.templates to anon;
