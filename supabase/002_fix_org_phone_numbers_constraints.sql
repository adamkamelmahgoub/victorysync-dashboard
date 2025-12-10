-- Migration 002: Fix org_phone_numbers constraints to allow same phone in multiple orgs
-- Purpose: Enable many-to-many relationship where one phone can be assigned to multiple organizations

-- First, check if org_phone_numbers table exists, if not create it
CREATE TABLE IF NOT EXISTS public.org_phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number_id uuid NOT NULL REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Drop old constraints if they exist
ALTER TABLE public.org_phone_numbers
  DROP CONSTRAINT IF EXISTS org_phone_numbers_phone_number_id_key CASCADE;

ALTER TABLE public.org_phone_numbers
  DROP CONSTRAINT IF EXISTS org_phone_numbers_phone_number_id_org_id_key CASCADE;

-- Ensure we have a primary key
ALTER TABLE public.org_phone_numbers
  ADD CONSTRAINT org_phone_numbers_pkey
  PRIMARY KEY (id)
  ON CONFLICT DO NOTHING;

-- Add unique constraint only on the pair (org_id, phone_number_id)
-- This allows the same phone_number_id to exist in multiple orgs
ALTER TABLE public.org_phone_numbers
  ADD CONSTRAINT org_phone_numbers_org_id_phone_number_id_unique
  UNIQUE (org_id, phone_number_id)
  ON CONFLICT DO NOTHING;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_org_phone_numbers_org_id
  ON public.org_phone_numbers (org_id);

CREATE INDEX IF NOT EXISTS idx_org_phone_numbers_phone_number_id
  ON public.org_phone_numbers (phone_number_id);

COMMIT;
