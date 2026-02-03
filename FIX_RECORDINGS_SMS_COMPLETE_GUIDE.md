# 🔧 Complete Fix Guide: Recordings & SMS Sync

## Current Status

**Sync Results:**
- ✅ Call Reports: 11 per org syncing successfully
- ❌ Recordings: 498 per org ready to sync (blocked by FK constraint)
- ❌ SMS Messages: 332 per org ready to sync (table doesn't exist)

The MightyCall API is working perfectly and returning all the data. We just need to:
1. Create the SMS table in Supabase
2. Drop the FK constraint on recordings

---

## Step 1: Create the SMS Table

### In Supabase Dashboard:

1. Go to: https://supabase.com/dashboard
2. Select your project: `victorysync`
3. Click **"SQL Editor"** (left sidebar)
4. Click **"New Query"**
5. **Copy and paste this SQL:**

```sql
-- Create mightycall_sms_messages table
CREATE TABLE IF NOT EXISTS public.mightycall_sms_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  external_id text,
  external_sms_id text,
  from_number text,
  to_number text,
  sender text,
  recipient text,
  direction text,
  status text,
  message text,
  body text,
  message_date timestamptz,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, external_id),
  UNIQUE(org_id, external_sms_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mightycall_sms_org_id ON public.mightycall_sms_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_mightycall_sms_sent_at ON public.mightycall_sms_messages(sent_at DESC);
```

6. Click **"Execute"**
7. Should see: "Query executed successfully"

---

## Step 2: Drop the FK Constraint on Recordings

### In the same Supabase SQL Editor:

1. Click **"New Query"** (to create another query)
2. **Copy and paste this SQL:**

```sql
-- Drop the FK constraint blocking recordings inserts
ALTER TABLE public.mightycall_recordings 
  DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;

-- Make call_id nullable for flexibility
ALTER TABLE public.mightycall_recordings 
  ALTER COLUMN call_id DROP NOT NULL;
```

3. Click **"Execute"**
4. Should see: "Query executed successfully"

---

## Step 3: Run the Sync

Once both SQL queries are executed in Supabase, run:

```bash
npm run sync:mightycall
```

### Expected Output:

```
[sync_all_orgs] starting org 09418d4a-a055-45e9-b9ad-c14f00c16862

[syncMightyCallRecordings] Org 09418d4a-a055-45e9-b9ad-c14f00c16862: 
  API returned 498 recordings
  inserting 498 rows...
  insert SUCCESS, synced 498 rows

[syncMightyCallSMS] Org 09418d4a-a055-45e9-b9ad-c14f00c16862: 
  API returned 332 SMS messages
  inserting 332 rows...
  insert SUCCESS, synced 332 rows

...

[sync_all_orgs] complete. Totals:
reportsSynced: 88   (11 × 8 orgs)
recordingsSynced: 3984   (498 × 8 orgs)
smsSynced: 2656   (332 × 8 orgs)
```

---

## Step 4: Verify Data

### Option A: Check via Supabase Dashboard

1. Go to Supabase Dashboard
2. Click **"Table Editor"** (left sidebar)
3. Look for:
   - `mightycall_recordings` - should show ~3984 rows
   - `mightycall_sms_messages` - should show ~2656 rows

### Option B: Check via SQL Query

In SQL Editor, run:

```sql
-- Check recordings count
SELECT COUNT(*) as recording_count FROM public.mightycall_recordings;
-- Expected: ~3984

-- Check SMS count
SELECT COUNT(*) as sms_count FROM public.mightycall_sms_messages;
-- Expected: ~2656

-- View sample recording
SELECT * FROM public.mightycall_recordings LIMIT 1;

-- View sample SMS
SELECT * FROM public.mightycall_sms_messages LIMIT 1;
```

---

## Troubleshooting

### Issue: "FK constraint still exists" error

**Solution:** The constraint might already be dropping. Try the migration again or wait a moment and re-run sync.

### Issue: "Table does not exist" for SMS

**Solution:** Make sure you ran Step 1 and the SQL executed successfully.

### Issue: Sync returns 0 rows

**Steps to debug:**
1. Check that both SQL migrations executed successfully
2. Check that the tables exist in Supabase Table Editor
3. Check the sync logs for specific error messages
4. Run: `npm run sync:mightycall 2>&1 | grep -i error` (or use Select-String on Windows)

### Issue: Still seeing FK constraint error

**Possible causes:**
- The migration didn't execute fully
- Supabase schema cache needs refresh

**Solution:**
1. Go to Supabase Dashboard → Table Editor
2. Click on `mightycall_recordings` table
3. Go to the **"Constraints"** tab
4. Verify that `mightycall_recordings_call_id_fkey` is NOT listed
5. If still there, try dropping it manually:
   - Click the constraint
   - Click **"Delete"**

---

## Why This Works

### The Problem
- `mightycall_recordings` table had a foreign key constraint that required `call_id` to reference the `calls` table
- The `calls` table is empty (we don't sync calls separately)
- MightyCall API returns recording IDs that don't match any call IDs
- So all insert attempts failed

### The Solution
- **For SMS:** Create the missing `mightycall_sms_messages` table
- **For Recordings:** Drop the FK constraint since we're using external recording IDs, not call references

This is safe because:
1. The `call_id` is just an identifier from MightyCall API
2. We don't actually need to reference calls (they're a separate concern)
3. The recording data itself is complete and independently valid

---

## Files Involved

- [server/src/integrations/mightycall.ts](./server/src/integrations/mightycall.ts) - Sync logic
- [server/src/scripts/sync_all_orgs_since_aug2025.ts](./server/src/scripts/sync_all_orgs_since_aug2025.ts) - Orchestrator
- [supabase/002_remove_recordings_fk.sql](./supabase/002_remove_recordings_fk.sql) - FK migration
- [server/src/scripts/create_sms_table.ts](./server/src/scripts/create_sms_table.ts) - SMS table creation script

---

## Next Steps After Sync

Once recordings and SMS are synced:

1. ✅ Verify data in dashboard
2. ✅ Check that counts match expectations (3984 recordings, 2656 SMS per 8 orgs)
3. ✅ Test frontend if you have a dashboard for viewing this data
4. ✅ Check that data dates are correct (from August 2025 to present)

All data is from the real MightyCall API with no demo data - exactly as requested!
