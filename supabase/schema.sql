-- ──────────────────────────────────────────────────────────────
-- OU SPATIAL ENGINE — live campus alert feed
-- Run this in the Supabase SQL editor, then set
-- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
-- ──────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.campus_alerts (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('wifi','library','gate','crowd','event','safety','transport')),
  title      text not null check (char_length(title) between 3 and 140),
  detail     text not null default '' check (char_length(detail) <= 600),
  zone       text not null default 'Osmania University' check (char_length(zone) <= 120),
  severity   text not null default 'info' check (severity in ('info','warn','critical')),
  value      text,
  created_at timestamptz not null default now()
);

create index if not exists campus_alerts_created_at_idx
  on public.campus_alerts (created_at desc);

alter table public.campus_alerts enable row level security;

-- everyone can read the campus pulse
drop policy if exists "campus alerts are readable" on public.campus_alerts;
create policy "campus alerts are readable"
  on public.campus_alerts
  for select
  using (true);

-- anyone with the anon key may submit a report, with sane bounds
drop policy if exists "campus alerts can be submitted" on public.campus_alerts;
create policy "campus alerts can be submitted"
  on public.campus_alerts
  for insert
  with check (
    char_length(title) between 3 and 140
    and char_length(detail) <= 600
    and char_length(zone) <= 120
    and kind in ('wifi','library','gate','crowd','event','safety','transport')
    and severity in ('info','warn','critical')
  );

-- no client-side updates or deletes
drop policy if exists "campus alerts cannot be edited" on public.campus_alerts;
create policy "campus alerts cannot be edited"
  on public.campus_alerts
  for update
  using (false);

drop policy if exists "campus alerts cannot be deleted" on public.campus_alerts;
create policy "campus alerts cannot be deleted"
  on public.campus_alerts
  for delete
  using (false);

-- stream inserts to subscribed clients
do $$
begin
  alter publication supabase_realtime add table public.campus_alerts;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ── seed: a believable opening state ───────────────────────────
insert into public.campus_alerts (kind, title, detail, zone, severity, value)
values
  ('library', 'Reading Hall · Floor 2 at 82%', 'Floor 3 has 46 open seats. Digital resource zone available.', 'Dr. Zakir Husain Library', 'info', '46 seats'),
  ('wifi', 'OU-WiFi degraded at OUCE Block B', 'East access points at 34 Mbps while the uplink is rebalanced.', 'OUCE Block B', 'warn', '34 Mbps'),
  ('gate', 'Main Gate queue clearing', 'Visitor verification down to a 2-minute average. Vehicles: use East Gate.', 'Main Gate', 'info', '2 min'),
  ('crowd', 'Arts College quad at 71%', 'Post-lecture surge expected 13:10–13:40 around Fountain Plaza.', 'Arts College', 'info', '71%'),
  ('safety', 'Unlit stretch near Botanical Garden', 'Three lamp posts offline on the gravel path; night routing avoids it.', 'Botanical Garden', 'warn', null),
  ('transport', 'Campus shuttle approaching Library Plaza', 'Next electric shuttle in 6 minutes on the ring loop.', 'Library Plaza', 'info', '6 min')
on conflict do nothing;
