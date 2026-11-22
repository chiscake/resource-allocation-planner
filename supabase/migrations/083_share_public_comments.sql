-- 083: public /share/[token] — get_shared_node payload (model, children, comments)
-- and authenticated add/delete-own comment RPCs via share token.

drop function if exists public.get_shared_node(text);

create function public.get_shared_node(p_token text)
returns table (
  title text,
  model jsonb,
  result jsonb,
  children jsonb,
  comments jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    n.title,
    n.model,
    n.result,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'title', c.title,
            'kind', c.kind,
            'model', c.model,
            'result', c.result,
            'mutation', c.mutation,
            'what_if_generation', c.what_if_generation,
            'deleted_at', c.deleted_at
          )
          order by c.what_if_generation nulls last, c.created_at
        )
        from public.solve_nodes c
        where c.parent_id = n.id
          and c.deleted_at is null
      ),
      '[]'::jsonb
    ) as children,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', nc.id,
            'body', nc.body,
            'author_id', nc.author_id,
            'created_at', nc.created_at,
            'display_name', p.display_name
          )
          order by nc.created_at
        )
        from public.node_comments nc
        left join public.profiles p on p.id = nc.author_id
        where nc.node_id = n.id
      ),
      '[]'::jsonb
    ) as comments
  from public.share_links sl
  join public.solve_nodes n on n.id = sl.node_id
  where sl.token = p_token
    and sl.revoked_at is null
    and n.deleted_at is null
  limit 1;
$$;

grant execute on function public.get_shared_node(text) to anon, authenticated;

create or replace function public.add_comment_by_share_token(
  p_token text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_body text := trim(both from coalesce(p_body, ''));
  v_node_id uuid;
  v_row public.node_comments%rowtype;
  v_name text;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if char_length(v_body) = 0 then
    raise exception 'empty_body';
  end if;

  select sl.node_id
    into v_node_id
  from public.share_links sl
  join public.solve_nodes n on n.id = sl.node_id
  where sl.token = p_token
    and sl.revoked_at is null
    and n.deleted_at is null
  limit 1;

  if v_node_id is null then
    raise exception 'share_unavailable';
  end if;

  insert into public.node_comments (node_id, author_id, body)
  values (v_node_id, v_actor, v_body)
  returning * into v_row;

  select p.display_name into v_name
  from public.profiles p
  where p.id = v_actor;

  return jsonb_build_object(
    'id', v_row.id,
    'body', v_row.body,
    'author_id', v_row.author_id,
    'created_at', v_row.created_at,
    'display_name', v_name
  );
end;
$$;

revoke all on function public.add_comment_by_share_token(text, text) from public;
grant execute on function public.add_comment_by_share_token(text, text) to authenticated;

create or replace function public.delete_own_comment_by_share_token(
  p_token text,
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_node_id uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  select sl.node_id
    into v_node_id
  from public.share_links sl
  join public.solve_nodes n on n.id = sl.node_id
  where sl.token = p_token
    and sl.revoked_at is null
    and n.deleted_at is null
  limit 1;

  if v_node_id is null then
    raise exception 'share_unavailable';
  end if;

  delete from public.node_comments
  where id = p_comment_id
    and node_id = v_node_id
    and author_id = v_actor;

  if not found then
    raise exception 'forbidden';
  end if;
end;
$$;

revoke all on function public.delete_own_comment_by_share_token(text, uuid) from public;
grant execute on function public.delete_own_comment_by_share_token(text, uuid) to authenticated;
