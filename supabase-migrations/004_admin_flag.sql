-- 004_admin_flag.sql
-- Adds the is_admin flag that gates the /admin dashboard.
--
-- index.html referenced "005_admin_flag.sql" in a comment, but no such
-- migration exists in supabase-migrations/ (the folder goes 001, 002, 003).
-- That is the root cause of the admin portal never appearing: the column the
-- client queries was never created. This is that missing migration, numbered
-- to follow on from 003.
--
-- Safe to re-run.

-- ── The flag ────────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists is_admin boolean not null default false;

comment on column public.users.is_admin is
  'Grants access to the /admin dashboard. Set manually in Supabase for trusted staff only — never assigned from client code.';


-- ── RLS: let a signed-in user read their own row ────────────────────────────
-- The client reads name, avatar_url and is_admin from public.users as the
-- signed-in user. Without a self-select policy, RLS returns zero rows with no
-- error, which the app cannot distinguish from "not an admin".
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'users_select_own'
  ) then
    create policy users_select_own on public.users
      for select using (auth.uid() = id);
  end if;
end $$;


-- ── Admin check helper ──────────────────────────────────────────────────────
-- SECURITY DEFINER so an admin-read policy ON public.users can call it without
-- recursing into its own policy. Without this indirection, a policy of the form
-- "using (exists (select 1 from public.users where id = auth.uid() and is_admin))"
-- causes infinite recursion.
create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $fn$
  select coalesce((select u.is_admin from public.users u where u.id = auth.uid()), false)
$fn$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;


-- ── Admin read access to the tables the dashboard aggregates ────────────────
-- The dashboard counts rows across users, trip_requests, clubs and
-- club_members. Under RLS those counts come back as 0 or 1 without these.
--
-- Longer term the cleaner answer is a Netlify function using the service-role
-- key, so the browser never needs table-wide read access at all. These
-- policies are the pragmatic version: admin-only, read-only.
do $$
declare
  t text;
begin
  foreach t in array array['users', 'trip_requests', 'clubs', 'club_members']
  loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t)
       and not exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = t
           and policyname = t || '_select_admin'
       )
    then
      execute format(
        'create policy %I on public.%I for select using (public.is_admin())',
        t || '_select_admin', t
      );
    end if;
  end loop;
end $$;


-- ── Grant yourself access ───────────────────────────────────────────────────
-- Creates the public.users row if it doesn't exist yet (a missing row is the
-- other half of why the Admin link never appeared) and sets the flag.
-- Change the email if you sign in with a different one.
insert into public.users (id, email, is_admin)
select au.id, au.email, true
from auth.users au
where au.email = 'simon@credsvault.io'
on conflict (id) do update set is_admin = true;


-- ── Verify ──────────────────────────────────────────────────────────────────
select id, email, is_admin from public.users where is_admin = true;
