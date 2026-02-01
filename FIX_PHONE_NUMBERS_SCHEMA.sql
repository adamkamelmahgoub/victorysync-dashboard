-- FIX: Proper migration for phone_numbers table to add e164 and number_digits columns
-- This fixes the schema mismatch where code expects e164/number_digits but columns don't exist

BEGIN;

-- Step 1: Check if e164 column already exists, if not add it
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='phone_numbers' AND column_name='e164'
  ) THEN
    ALTER TABLE public.phone_numbers 
    ADD COLUMN e164 text UNIQUE;
  END IF;
END $$;

-- Step 2: Check if number_digits column exists, if not add it  
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='phone_numbers' AND column_name='number_digits'
  ) THEN
    ALTER TABLE public.phone_numbers 
    ADD COLUMN number_digits text;
  END IF;
END $$;

-- Step 3: Populate e164 from number if number exists
UPDATE public.phone_numbers 
SET e164 = number 
WHERE e164 IS NULL AND number IS NOT NULL;

-- Step 4: Populate number_digits (strip non-digits from e164 or number)
UPDATE public.phone_numbers
SET number_digits = REGEXP_REPLACE(COALESCE(e164, number), '\D', '', 'g')
WHERE number_digits IS NULL AND (e164 IS NOT NULL OR number IS NOT NULL);

-- Step 5: Create index on number_digits for efficient lookups
CREATE INDEX IF NOT EXISTS idx_phone_numbers_number_digits 
ON public.phone_numbers(number_digits);

-- Step 6: Create composite index for org_id + number_digits lookups
CREATE INDEX IF NOT EXISTS idx_phone_numbers_org_number_digits 
ON public.phone_numbers(org_id, number_digits);

COMMIT;
