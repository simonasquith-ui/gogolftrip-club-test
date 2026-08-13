-- ============================================================
-- GolfTrip — link trips to clubs (additive, run after 001)
-- Lets the club dashboard show "trips created by our members"
-- without touching any existing trip_requests rows.
-- ============================================================

alter table trip_requests
  add column if not exists club_id uuid references clubs(id) on delete set null;

create index if not exists idx_trip_requests_club on trip_requests(club_id);
