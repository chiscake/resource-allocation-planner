-- Fix infinite recursion: solve_nodes <-> share_links policies

drop policy if exists solve_nodes_share_select on public.solve_nodes;

create or replace function public.get_shared_node(p_token text)
returns table (title text, result jsonb)
language sql
security definer
set search_path = public
as $$
  select n.title, n.result
  from public.share_links sl
  join public.solve_nodes n on n.id = sl.node_id
  where sl.token = p_token
    and sl.revoked_at is null
  limit 1;
$$;

grant execute on function public.get_shared_node(text) to anon, authenticated;
