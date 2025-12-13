-- Migration 005: Add optimized indexes and aggregated metrics function
-- Purpose: Speed up org-per-phone metrics queries by using server-side aggregation and suitable indexes

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calls_to_number ON public.calls (to_number);
CREATE INDEX IF NOT EXISTS idx_calls_to_number_started_at ON public.calls (to_number, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_to_number_digits_started_at ON public.calls (to_number_digits, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_org_id_to_number_started_at ON public.calls (org_id, to_number, started_at DESC);

-- Partial index for answered status (common filter)
CREATE INDEX IF NOT EXISTS idx_calls_org_started_answered ON public.calls (org_id, started_at DESC) WHERE status IN ('answered','completed');

-- Aggregated function for per-phone metrics
-- Given an org_id, start_time, end_time returns per-phone aggregated metrics
DROP FUNCTION IF EXISTS public.get_org_phone_metrics(uuid,timestamptz,timestamptz);
CREATE OR REPLACE FUNCTION public.get_org_phone_metrics(_org_id uuid, _start timestamptz, _end timestamptz)
RETURNS TABLE (
  phone_id uuid,
  phone_number text,
  label text,
  calls_count integer,
  answered_count integer,
  missed_count integer,
  answer_rate numeric,
  avg_handle_seconds integer,
  avg_speed_seconds integer
) AS $$
BEGIN
  RETURN QUERY
  WITH org_phones AS (
    SELECT id, number AS phone_number, number_digits AS phone_digits, label
    FROM public.phone_numbers
    WHERE org_id = _org_id
  ),
  filtered_calls AS (
    SELECT
      COALESCE(to_number_digits, to_number) AS key_num,
      status,
      COALESCE(duration, NULL) AS duration,
      started_at,
      answered_at,
      ended_at
    FROM public.calls
    WHERE started_at >= _start AND started_at <= _end
      AND (
        to_number_digits IN (SELECT phone_digits FROM org_phones)
        OR regexp_replace(to_number, '\\D', '', 'g') IN (SELECT phone_digits FROM org_phones)
        OR to_number IN (SELECT phone_number FROM org_phones)
      )
  ),
  agg AS (
    SELECT
      key_num,
      COUNT(*) AS calls_count,
      SUM(CASE WHEN LOWER(COALESCE(status,'')) IN ('answered','completed') THEN 1 ELSE 0 END) AS answered_count,
      SUM(CASE WHEN LOWER(COALESCE(status,'')) = 'missed' THEN 1 ELSE 0 END) AS missed_count,
      FLOOR(COALESCE(AVG(CASE WHEN duration IS NOT NULL THEN duration ELSE EXTRACT(EPOCH FROM (ended_at - answered_at)) END), 0))::integer AS avg_handle_seconds,
      FLOOR(COALESCE(AVG(CASE WHEN answered_at IS NOT NULL THEN EXTRACT(EPOCH FROM (answered_at - started_at)) END), 0))::integer AS avg_speed_seconds
    FROM filtered_calls
    GROUP BY key_num
  )
  SELECT p.id, p.phone_number AS phone_number, p.label,
    COALESCE(a.calls_count, 0) as calls_count,
    COALESCE(a.answered_count, 0) as answered_count,
    COALESCE(a.missed_count, 0) as missed_count,
    CASE WHEN COALESCE(a.calls_count,0) = 0 THEN 0 ELSE ROUND(COALESCE(a.answered_count,0)::numeric * 100.0 / a.calls_count, 2) END as answer_rate,
    COALESCE(a.avg_handle_seconds, 0) as avg_handle_seconds,
    COALESCE(a.avg_speed_seconds, 0) as avg_speed_seconds
  FROM org_phones p
  LEFT JOIN agg a
    ON a.key_num = COALESCE(p.phone_digits, p.phone_number);
END; $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Commit (for SQL editors that expect explicit commit)
COMMIT;

-- Compatibility wrapper for clients that pass args in different alphabetical orders
DROP FUNCTION IF EXISTS public.get_org_phone_metrics_alpha(timestamptz,uuid,timestamptz);
CREATE OR REPLACE FUNCTION public.get_org_phone_metrics_alpha(_end timestamptz, _org_id uuid, _start timestamptz)
RETURNS TABLE (
  phone_id uuid,
  phone_number text,
  label text,
  calls_count integer,
  answered_count integer,
  missed_count integer,
  answer_rate numeric,
  avg_handle_seconds integer,
  avg_speed_seconds integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.get_org_phone_metrics(_org_id := _org_id, _start := _start, _end := _end);
END; $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMIT;
