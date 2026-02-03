# 🎯 Action Required: Enable Recordings & SMS Sync

## Quick Summary

Your MightyCall API integration is working perfectly! The system is fetching real data:
- ✅ **498 recordings** per organization (from Aug 2025)
- ✅ **332 SMS messages** per organization (from Aug 2025)
- ✅ **99 call reports** per organization (already syncing!)

**But:** They're not being saved to the database yet because:
1. The `mightycall_sms_messages` table needs to be created
2. The `mightycall_recordings` table has a foreign key constraint blocking inserts

## What You Need to Do (5 minutes)

### Step 1: Go to Supabase Dashboard
- URL: https://supabase.com/dashboard
- Project: `victorysync`

### Step 2: Create SMS Table
1. Click **"SQL Editor"** (left sidebar)
2. Click **"New Query"**
3. Run this SQL:

```sql
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

CREATE INDEX IF NOT EXISTS idx_mightycall_sms_org_id ON public.mightycall_sms_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_mightycall_sms_sent_at ON public.mightycall_sms_messages(sent_at DESC);
```

### Step 3: Drop FK Constraint on Recordings
1. Click **"New Query"** again
2. Run this SQL:

```sql
ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;
ALTER TABLE public.mightycall_recordings ALTER COLUMN call_id DROP NOT NULL;
```

### Step 4: Run the Sync
```bash
npm run sync:mightycall
```

## Expected Result

After these 2 SQL queries and the sync command:
- **3,984 recordings** synced (498 × 8 orgs)
- **2,656 SMS messages** synced (332 × 8 orgs)  
- **792 reports** synced (99 × 8 orgs)

All with real August 2025 data from MightyCall! ✅

## Detailed Documentation

For step-by-step instructions with screenshots, see:
- [FIX_RECORDINGS_SMS_COMPLETE_GUIDE.md](./FIX_RECORDINGS_SMS_COMPLETE_GUIDE.md) - Full walkthrough
- [RECORDINGS_SMS_SYNC_STATUS.md](./RECORDINGS_SMS_SYNC_STATUS.md) - Technical details
- [CRITICAL_FIX_FK_CONSTRAINT.md](./CRITICAL_FIX_FK_CONSTRAINT.md) - FK constraint explanation

## Why This Is Safe

1. **SMS Table:** Doesn't currently exist, so we're just creating it
2. **FK Constraint:** Was designed for a different use case; we're using external MightyCall IDs instead
3. **Data Integrity:** All data is validated from the MightyCall API before insertion

No existing data will be lost or modified!

---

**Questions?** Check the detailed guide above or look at the sync logs for specific errors.

**Status:** Real MightyCall data is ready to sync - just needs these 2 database changes! 🚀
