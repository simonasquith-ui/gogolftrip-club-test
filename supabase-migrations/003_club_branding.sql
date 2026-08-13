-- ============================================================
-- GolfTrip — club branding fields (additive, run after 001/002)
-- Powers the public club portal at /club/:slug — the portal reads
-- these directly, so a club admin editing them updates their public
-- page immediately, no redeploy needed.
-- ============================================================

alter table clubs
  add column if not exists logo_url text,
  add column if not exists primary_color text default '#1a3a2a',   -- hex, matches --green default
  add column if not exists secondary_color text default '#c9a84c', -- hex, matches --gold default
  add column if not exists tagline text,
  add column if not exists description text;

-- The public club portal (/club/:slug) has to be visible to logged-out
-- visitors — that's the whole point of a discoverable, shareable club
-- page. The 001 migration's clubs SELECT policy only covered members and
-- the admin; this adds anonymous/public read for active clubs on top of
-- that (Postgres RLS policies are OR'd together, so members/admins keep
-- their existing access to pending/cancelled clubs too).
create policy "Anyone can view active clubs' public page"
  on clubs for select
  using (plan_status = 'active');
