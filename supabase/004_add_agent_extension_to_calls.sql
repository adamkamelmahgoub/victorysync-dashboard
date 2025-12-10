-- Migration 004: Add agent_extension column to calls table
-- Purpose: Store the MightyCall extension for the agent who answered/handled the call

ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS agent_extension text;

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_calls_agent_extension
  ON public.calls (agent_extension)
  WHERE agent_extension IS NOT NULL;

COMMIT;
