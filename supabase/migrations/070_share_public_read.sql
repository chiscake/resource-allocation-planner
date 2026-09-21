-- Public read of non-revoked share links for /share/[token]
-- NOTE: do NOT add a solve_nodes policy that reads share_links (RLS recursion).
-- Node payload is exposed via get_shared_node() in 072.

create policy share_links_public_select on public.share_links
  for select to anon, authenticated
  using (revoked_at is null);
