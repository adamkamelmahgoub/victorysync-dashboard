-- Migration 003: Add agent_extensions table for mapping extensions to agent display names
-- Purpose: Enable mapping of MightyCall extensions to agent names for display in UI

CREATE TABLE IF NOT EXISTS public.agent_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  extension text NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, extension),
  UNIQUE(org_id, user_id)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_agent_extensions_org_id
  ON public.agent_extensions (org_id);

CREATE INDEX IF NOT EXISTS idx_agent_extensions_extension
  ON public.agent_extensions (extension);

CREATE INDEX IF NOT EXISTS idx_agent_extensions_user_id
  ON public.agent_extensions (user_id);

CREATE INDEX IF NOT EXISTS idx_agent_extensions_org_extension
  ON public.agent_extensions (org_id, extension);

COMMIT;
