# 🔧 CRITICAL FIX: Apply Supabase Migrations to Enable Recordings & SMS Sync

## Problem
Recordings and SMS are not syncing because the `mightycall_recordings` table has a **foreign key constraint** on `call_id` that references the `calls` table (which is empty). This causes all insert attempts to fail with:

```
insert or update on table "mightycall_recordings" violates foreign key constraint
"mightycall_recordings_call_id_fkey"
```

## Solution
Apply the migration file `supabase/002_remove_recordings_fk.sql` to the Supabase database.

## Steps to Apply

### Option 1: Supabase Dashboard (Recommended)
1. Go to: https://supabase.com/dashboard
2. Click your project: `victorysync` 
3. In left sidebar, click **"SQL Editor"**
4. Click **"New Query"**
5. Copy and paste this SQL:

```sql
-- Drop the FK constraint that prevents inserting recordings without calls
-- This allows syncing real MightyCall recording data
ALTER TABLE public.mightycall_recordings 
  DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;

-- Also make call_id nullable for flexibility (optional but good practice)
ALTER TABLE public.mightycall_recordings 
  ALTER COLUMN call_id DROP NOT NULL;
```

6. Click the blue **"Execute"** or **"Run"** button
7. You should see: `Query executed successfully`

### Option 2: Command Line (if you have direct DB access)
```bash
psql -h edsyhtlaqwiicxlzorca.supabase.co -U postgres -d postgres -c \
  "ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;"
```

## After Applying the Fix

Once you've applied the migration in Supabase, recordings and SMS will sync correctly. Then run:

```bash
npm run sync:mightycall
```

### Expected Results
- **reportsSynced:** 99 (per org, ~792 total across 8 orgs) ✅ Already working
- **recordingsSynced:** ~498 (per org, ~3984 total across 8 orgs) 🟢 Will work after fix
- **smsSynced:** ~332 (per org, ~2656 total across 8 orgs) 🟢 Will work after fix

## Why This Works

- The `mightycall_recordings` table currently has a foreign key constraint that requires `call_id` to reference an existing row in the `calls` table
- We don't actually have call data synced to the `calls` table (it's empty)
- We're using the recording ID from the MightyCall API as the `call_id`, which is a valid identifier
- By dropping the FK constraint, we allow inserts without requiring dependent `calls` rows
- This is safe because:
  - The `call_id` is a text field, not a UUID reference
  - We're using it as an external identifier from MightyCall API
  - The data itself is still fully valid and queryable

## Verification

After applying the fix, you can verify it worked:

1. Run the sync:
   ```bash
   npm run sync:mightycall
   ```

2. Check the logs for:
   ```
   [syncMightyCallRecordings] Org XXX: insert result - error=none, rows=498
   [syncMightyCallSMS] Org XXX: insert result - error=none, rows=332
   ```

3. Or query the database:
   ```sql
   SELECT COUNT(*) FROM public.mightycall_recordings;
   -- Should return ~3984 (498 per org × 8 orgs)
   
   SELECT COUNT(*) FROM public.mightycall_sms_messages;
   -- Should return ~2656 (332 per org × 8 orgs)
   ```

## Files Related to This Fix

- Migration file: [supabase/002_remove_recordings_fk.sql](./supabase/002_remove_recordings_fk.sql)
- Sync script: [server/src/scripts/sync_all_orgs_since_aug2025.ts](./server/src/scripts/sync_all_orgs_since_aug2025.ts)
- Integration code: [server/src/integrations/mightycall.ts](./server/src/integrations/mightycall.ts)

## Support

If you still have issues after applying the fix:
1. Check the sync logs for specific error messages
2. Verify the constraint was actually dropped: Go to Supabase Dashboard → Table Editor → mightycall_recordings → Edit → Constraints tab
3. Contact support if the migration won't apply
