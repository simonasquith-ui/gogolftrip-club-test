-- ============================================================
-- GolfTrip — Club revenue strand migration
-- Additive only. Does not touch trip_requests, trip_members,
-- trip_results, trip_messages, trip_votes, users, user_plans, etc.
-- Run this once in the Supabase SQL editor.
-- ============================================================

-- A golf club that pays the flat £1,000/year fee. All its members
-- get free access to everything an "individual" paying user gets.
create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,               -- e.g. 'harlow-golf-club' — used for future /club/:slug portal
  admin_user_id uuid references auth.users(id) on delete set null, -- who signed the club up / manages billing
  plan_status text not null default 'pending',  -- 'pending' | 'active' | 'past_due' | 'cancelled'
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clubs_slug on clubs(slug);
create index if not exists idx_clubs_stripe_customer on clubs(stripe_customer_id);

-- Which users belong to which club. A user with a row here, in a club
-- whose plan_status = 'active', gets free full access — no personal
-- Stripe subscription required.
create table if not exists club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',     -- 'admin' | 'member' (organiser role is assigned per-trip later, not here)
  joined_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create index if not exists idx_club_members_user on club_members(user_id);
create index if not exists idx_club_members_club on club_members(club_id);

-- RLS — mirrors the pattern your other tables likely already use.
-- Review these against your existing policies before relying on them;
-- written for a single-select service-role webhook write pattern like
-- stripe-webhook.js already uses for user_plans.
alter table clubs enable row level security;
alter table club_members enable row level security;

create policy "Club members can view their own club"
  on clubs for select
  using (
    id in (select club_id from club_members where user_id = auth.uid())
    or admin_user_id = auth.uid()
  );

create policy "Club admin can update their own club"
  on clubs for update
  using (admin_user_id = auth.uid());

create policy "Users can view their own club membership rows"
  on club_members for select
  using (user_id = auth.uid());

create policy "Users can insert their own club membership row"
  on club_members for insert
  with check (user_id = auth.uid());
