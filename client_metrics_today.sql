-- Run this whole script once in the Supabase SQL editor.

-- 1) Base calls table (only creates if it does NOT exist yet)
create table if not exists public.calls (
  id bigserial primary key,
  org_id uuid not null,
  call_id text unique not null,
  direction text check (direction in ('inbound','outbound')),
  status text, -- e.g. 'answered','missed'
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz
);

-- 2) View that gives "today's" metrics per org
drop view if exists public.client_metrics_today;

create view public.client_metrics_today as
select
  org_id,
  date_trunc('day', started_at)::date as day,
  count(*)                                        as total_calls,
  count(*) filter (where status = 'answered')     as answered_calls,
  round(
    100.0 * count(*) filter (where status = 'answered')
    / greatest(count(*), 1),
    1
  )                                               as answer_rate_pct,
  coalesce(
    round(
      avg(
        extract(epoch from (answered_at - started_at))
      )::numeric,
      0
    ),
    0
  )                                               as avg_wait_seconds
from public.calls
where started_at >= date_trunc('day', now())
group by org_id, date_trunc('day', started_at);

-- 3) Insert some sample data for testing
-- Replace this UUID with your real org_id that you use in the dashboard.
insert into public.calls
  (org_id, call_id, direction, status, started_at, answered_at, ended_at)
values
  ('9c210e39-5bc5-49f1-9977-8ceee5262155', 'test-call-1', 'inbound', 'answered',
   now() - interval '40 seconds',
   now() - interval '30 seconds',
   now() - interval '10 seconds'),
  ('9c210e39-5bc5-49f1-9977-8ceee5262155', 'test-call-2', 'inbound', 'answered',
   now() - interval '20 minutes',
   now() - interval '19 minutes 40 seconds',
   now() - interval '19 minutes'),
  ('9c210e39-5bc5-49f1-9977-8ceee5262155', 'test-call-3', 'inbound', 'missed',
   now() - interval '10 minutes',
   null,
   now() - interval '10 minutes');
