
create policy el_profiles_read_published_workers
on public.el_profiles for select to anon, authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.el_worker_profiles wp
    where wp.user_id = id and wp.is_published = true
  )
);
grant select on public.el_profiles to anon;
