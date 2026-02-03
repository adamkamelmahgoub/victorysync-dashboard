-- Drop the foreign key constraint that's blocking recordings and SMS inserts
-- The mightycall_recordings table references calls.id, but we don't have call data synced
-- We'll use recording IDs instead of actual call IDs

ALTER TABLE public.mightycall_recordings 
  DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;

-- Also make call_id nullable for future flexibility
ALTER TABLE public.mightycall_recordings 
  ALTER COLUMN call_id DROP NOT NULL;
