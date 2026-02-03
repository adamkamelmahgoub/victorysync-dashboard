-- Fix the mightycall_reports constraint to handle NULLs
-- The current UNIQUE constraint fails because NULL != NULL in PostgreSQL
-- We need to add a partial unique index that includes IS NOT NULL clauses

-- Drop the old constraint
ALTER TABLE public.mightycall_reports 
DROP CONSTRAINT mightycall_reports_org_id_phone_number_id_report_type_report_date_key;

-- Create a partial unique index for non-null phone_number_ids
CREATE UNIQUE INDEX IF NOT EXISTS mightycall_reports_org_phone_type_date_key
ON public.mightycall_reports(org_id, phone_number_id, report_type, report_date)
WHERE phone_number_id IS NOT NULL;

-- Create a partial unique index for null phone_number_ids (org_id, report_type, report_date only)
CREATE UNIQUE INDEX IF NOT EXISTS mightycall_reports_org_null_phone_type_date_key
ON public.mightycall_reports(org_id, report_type, report_date)
WHERE phone_number_id IS NULL;

-- Add back a table constraint that matches one of these
ALTER TABLE public.mightycall_reports 
ADD CONSTRAINT mightycall_reports_unique_report
UNIQUE (org_id, phone_number_id, report_type, report_date)
WHERE phone_number_id IS NOT NULL;
