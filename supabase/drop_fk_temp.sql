-- Temporary: Drop FK constraint on mightycall_recordings.call_id to allow inserting recordings without dependent calls rows
-- This is for populating with real MightyCall data; can be re-added later with proper data integrity

ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;

-- Re-add the constraint if needed in the future:
-- ALTER TABLE public.mightycall_recordings ADD CONSTRAINT mightycall_recordings_call_id_fkey 
--   FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE CASCADE;
