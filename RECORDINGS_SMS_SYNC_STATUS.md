# 📋 Recordings & SMS Sync Status - Action Required

## Summary
- ✅ **Call Reports:** Syncing successfully (99 rows per org)
- ❌ **Recordings:** Blocked by FK constraint (~498 rows per org ready to sync)
- ❌ **SMS Messages:** Blocked by FK constraint (~332 rows per org ready to sync)

## The Problem

The MightyCall API is returning data as expected:
- **Recordings:** 498 per organization (from Aug 2025 - present)
- **SMS Messages:** 332 per organization (from Aug 2025 - present)

But inserts are failing because the `mightycall_recordings` table has a **foreign key constraint** that requires `call_id` to reference the `calls` table. Since the `calls` table is empty and we're using recording IDs instead of call IDs, the inserts fail.

### Error Message
```
insert or update on table "mightycall_recordings" violates foreign key constraint 
"mightycall_recordings_call_id_fkey"
```

## The Solution

Drop the foreign key constraint from the database. This is safe because:
1. We're using MightyCall recording IDs (valid external identifiers)
2. The data itself is complete and queryable
3. We don't actually sync the `calls` table separately

### How to Apply the Fix

Go to [Supabase Dashboard](https://supabase.com/dashboard) and execute this SQL in the SQL Editor:

```sql
ALTER TABLE public.mightycall_recordings 
  DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;

ALTER TABLE public.mightycall_recordings 
  ALTER COLUMN call_id DROP NOT NULL;
```

**Steps:**
1. Go to https://supabase.com/dashboard
2. Select project: `victorysync`
3. Click **SQL Editor** (left sidebar)
4. Click **New Query**
5. Paste the SQL above
6. Click **Execute**
7. Should see: "Query executed successfully"

## After Applying the Fix

Once applied, run the sync:

```bash
npm run sync:mightycall
```

### Expected Output
```
[sync_all_orgs] Syncing 8 organizations from 2025-08-01 to 2026-02-02...

[syncMightyCallReports] Org 09418d4a-a055-45e9-b9ad-c14f00c16862: ...
[syncMightyCallReports] Org 09418d4a-a055-45e9-b9ad-c14f00c16862: insert SUCCESS, synced 99 rows

[syncMightyCallRecordings] Org 09418d4a-a055-45e9-b9ad-c14f00c16862: ...
[syncMightyCallRecordings] Org 09418d4a-a055-45e9-b9ad-c14f00c16862: insert SUCCESS, synced 498 rows

[syncMightyCallSMS] Org 09418d4a-a055-45e9-b9ad-c14f00c16862: ...
[syncMightyCallSMS] Org 09418d4a-a055-45e9-b9ad-c14f00c16862: insert SUCCESS, synced 332 rows

...

[sync_all_orgs] complete. Totals:
reportsSynced: 792  (99 × 8 orgs)
recordingsSynced: 3984  (498 × 8 orgs)
smsSynced: 2656  (332 × 8 orgs)
```

## Verification

After the fix, verify the data is in the database:

```sql
-- Check recordings
SELECT COUNT(*) FROM public.mightycall_recordings;
-- Expected: ~3984 rows

-- Check SMS
SELECT COUNT(*) FROM public.mightycall_sms_messages;
-- Expected: ~2656 rows

-- Check sample
SELECT * FROM public.mightycall_recordings LIMIT 1;
SELECT * FROM public.mightycall_sms_messages LIMIT 1;
```

## Files Modified
- [server/src/integrations/mightycall.ts](./server/src/integrations/mightycall.ts) - Updated sync functions with better error logging
- [supabase/002_remove_recordings_fk.sql](./supabase/002_remove_recordings_fk.sql) - Migration file (needs to be applied manually)

## Why This Happened

The database schema has a foreign key constraint that was designed for syncing actual call data from the `calls` table. However:
1. The `calls` table isn't being populated (empty)
2. We have recording data from MightyCall API with its own ID scheme
3. The FK constraint prevents inserting recordings without matching calls

This is a common schema design issue when multiple data sources have their own ID systems.

## Next Steps

1. **Apply the FK migration** (instructions above)
2. **Run the sync** to populate recordings and SMS data
3. **Check the data** appears in the Supabase dashboard

Need help? Check the [CRITICAL_FIX_FK_CONSTRAINT.md](./CRITICAL_FIX_FK_CONSTRAINT.md) for detailed instructions.
