-- Migration 001: Add to_number_digits column to calls table
-- Purpose: Enable efficient filtering of calls by phone number digits without the need for regex parsing at query time

-- Add the to_number_digits column if it doesn't exist
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS to_number_digits text;

-- Backfill existing data by stripping non-digits from to_number
UPDATE public.calls
SET to_number_digits = regexp_replace(to_number, '\D', '', 'g')
WHERE to_number IS NOT NULL
  AND (to_number_digits IS NULL OR to_number_digits = '');

-- Create index for efficient lookups and joins
CREATE INDEX IF NOT EXISTS idx_calls_to_number_digits
  ON public.calls (to_number_digits);

-- Create composite index for org/phone filtering
CREATE INDEX IF NOT EXISTS idx_calls_org_to_number_digits
  ON public.calls (org_id, to_number_digits)
  WHERE org_id IS NOT NULL;

COMMIT;
