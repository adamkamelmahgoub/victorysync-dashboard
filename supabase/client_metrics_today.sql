-- VictorySync Client Metrics View
-- 
-- This SQL creates a view that aggregates today's call metrics per organization.
-- 
-- INSTRUCTIONS:
-- 1. Copy this entire SQL block.
-- 2. Open your Supabase dashboard.
-- 3. Go to the "SQL Editor" section.
-- 4. Create a new query and paste this SQL.
-- 5. Click "Run" to execute.
--
-- Note: This assumes you have a `public.calls` table with the columns shown below.
-- If your table has a different name or structure, adjust the query accordingly.

-- Optional: base table example (uncomment and run if you don't have a calls table yet)
-- create table if not exists public.calls (
--   id bigserial primary key,
--   org_id uuid not null,
--   call_id text unique not null,
--   direction text check (direction in ('inbound','outbound')),
--   status text,
--   started_at timestamptz,
--   answered_at timestamptz,
--   ended_at timestamptz,
--   created_at timestamptz default now()
-- );

-- Drop and recreate the view
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
