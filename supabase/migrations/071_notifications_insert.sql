-- Allow creating notifications for other users (share / org-owner delete)

drop policy if exists notifications_own on public.notifications;

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.solve_nodes n
      where n.id = entity_id and n.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.solve_nodes n
      join public.organization_members m on m.org_id = n.org_id
      where n.id = entity_id
        and m.user_id = auth.uid()
        and m.role = 'org_owner'
    )
  );
