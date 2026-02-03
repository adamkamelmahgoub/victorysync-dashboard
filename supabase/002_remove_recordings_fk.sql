-- Drop the FK constraint that prevents inserting recordings without calls
-- This allows syncing real MightyCall recording data
ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;
