-- EXPLAIN ANALYZE for org phone metrics aggregation
-- Run this in the Supabase SQL editor or psql with appropriate permissions

-- Replace '{ORG_ID}' with a real org id for testing
\set ORG_ID 'd6b7bbde-54bb-4782-989d-cf9093f8cadf'
\set START_TIME '2025-12-13 00:00:00+00'
\set END_TIME '2025-12-13 23:59:59+00'

EXPLAIN ANALYZE
WITH org_phones AS (
  SELECT id, number AS phone_number, number_digits
  FROM public.phone_numbers
  WHERE org_id = :'ORG_ID'
),
filtered_calls AS (
  SELECT
    COALESCE(to_number_digits, to_number) AS key_num,
    status, duration, started_at, answered_at, ended_at
  FROM public.calls
  WHERE started_at >= :'START_TIME' AND started_at <= :'END_TIME'
    AND (
      to_number IN (SELECT phone_number FROM org_phones) OR
      to_number_digits IN (SELECT number_digits FROM org_phones)
    )
),
agg AS (
  SELECT key_num,
    COUNT(*) AS calls_count,
    SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('answered','completed') THEN 1 ELSE 0 END) AS answered_count,
    SUM(CASE WHEN LOWER(COALESCE(status,'')) = 'missed' THEN 1 ELSE 0 END) AS missed_count,
    FLOOR(COALESCE(AVG(CASE WHEN duration IS NOT NULL THEN duration ELSE EXTRACT(EPOCH FROM (ended_at - answered_at)) END), 0))::integer AS avg_handle_seconds,
    FLOOR(COALESCE(AVG(CASE WHEN answered_at IS NOT NULL THEN EXTRACT(EPOCH FROM (answered_at - started_at)) END), 0))::integer AS avg_speed_seconds
  FROM filtered_calls
  GROUP BY key_num
)
SELECT p.id, p.phone_number, p.number_digits, COALESCE(a.calls_count,0) as calls_count, COALESCE(a.answered_count,0) as answered_count, COALESCE(a.missed_count,0) as missed_count, COALESCE(a.avg_handle_seconds,0) as avg_handle_seconds, COALESCE(a.avg_speed_seconds,0) as avg_speed_seconds
FROM org_phones p
LEFT JOIN agg a ON a.key_num = COALESCE(p.number_digits, p.phone_number);
