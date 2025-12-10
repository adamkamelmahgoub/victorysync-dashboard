-- ============================================
-- VictorySync Dashboard Database Migrations
-- Run these SQL statements in order in your Supabase SQL Editor
-- ============================================

-- Migration 001: Add to_number_digits column to calls table
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS to_number_digits text;
UPDATE public.calls SET to_number_digits = regexp_replace(to_number, '\D', '', 'g') WHERE to_number IS NOT NULL AND (to_number_digits IS NULL OR to_number_digits = '');
CREATE INDEX IF NOT EXISTS idx_calls_to_number_digits ON public.calls (to_number_digits);
CREATE INDEX IF NOT EXISTS idx_calls_org_to_number_digits ON public.calls (org_id, to_number_digits) WHERE org_id IS NOT NULL;

-- Migration 002: Fix org_phone_numbers constraints to allow same phone in multiple orgs
-- First, add the phone_number_id column if it doesn't exist
ALTER TABLE public.org_phone_numbers ADD COLUMN IF NOT EXISTS phone_number_id uuid;

-- Add foreign key constraint if the column exists and constraint doesn't
DO $$ 
BEGIN
  BEGIN
    ALTER TABLE public.org_phone_numbers ADD CONSTRAINT fk_phone_number_id FOREIGN KEY (phone_number_id) REFERENCES public.phone_numbers(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- Drop old constraints if they exist
ALTER TABLE public.org_phone_numbers DROP CONSTRAINT IF EXISTS org_phone_numbers_phone_number_id_key CASCADE;
ALTER TABLE public.org_phone_numbers DROP CONSTRAINT IF EXISTS org_phone_numbers_phone_number_id_org_id_key CASCADE;
ALTER TABLE public.org_phone_numbers DROP CONSTRAINT IF EXISTS org_phone_numbers_pkey CASCADE;

-- Add/ensure primary key
DO $$ 
BEGIN
  BEGIN
    ALTER TABLE public.org_phone_numbers ADD CONSTRAINT org_phone_numbers_pkey PRIMARY KEY (id);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- Add unique constraint on org_id, phone_number_id pair
DO $$ 
BEGIN
  BEGIN
    ALTER TABLE public.org_phone_numbers ADD CONSTRAINT org_phone_numbers_org_id_phone_number_id_unique UNIQUE (org_id, phone_number_id);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_phone_numbers_org_id ON public.org_phone_numbers (org_id);
CREATE INDEX IF NOT EXISTS idx_org_phone_numbers_phone_number_id ON public.org_phone_numbers (phone_number_id);

-- Migration 003: Add agent_extensions table for mapping extensions to agent display names
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

CREATE INDEX IF NOT EXISTS idx_agent_extensions_org_id ON public.agent_extensions (org_id);
CREATE INDEX IF NOT EXISTS idx_agent_extensions_extension ON public.agent_extensions (extension);
CREATE INDEX IF NOT EXISTS idx_agent_extensions_user_id ON public.agent_extensions (user_id);
CREATE INDEX IF NOT EXISTS idx_agent_extensions_org_extension ON public.agent_extensions (org_id, extension);

-- Migration 004: Add agent_extension column to calls table
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS agent_extension text;
CREATE INDEX IF NOT EXISTS idx_calls_agent_extension ON public.calls (agent_extension) WHERE agent_extension IS NOT NULL;

-- Migration 005: Create API key tables for platform and org-scoped keys
CREATE TABLE IF NOT EXISTS public.platform_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL,
  label text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.org_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_hash text NOT NULL,
  label text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_platform_api_keys_created_by ON public.platform_api_keys(created_by);
CREATE INDEX IF NOT EXISTS idx_org_api_keys_org_id ON public.org_api_keys(org_id);

-- ============================================
-- All migrations completed!
-- ============================================
