# Victory Sync Dashboard — Diagnostic & Fix Report
**Date:** May 11, 2026

---

## ISSUE 1: Live Status Not Updating When On a Call

### Root Cause
The decision logic in `server/src/services/mightycallLiveStatus.ts` (lines 858-896) had a critical flaw:
- If the `/profile/status` endpoint returned "Available" (idle), it would **override** active call evidence
- The "profile_idle_overrides_relaxed_history_probe" check at line 893 was a kill switch that forced idle status even when live call evidence existed

### Fix Applied
**File:** `server/src/services/mightycallLiveStatus.ts`
- Restructured the decision logic to **prioritize active call evidence** over profile status
- Active call evidence (from `/calls` and `/journal/requests`) now takes precedence
- Profile status is only used as a fallback when NO live call evidence exists
- The "profile_idle_overrides_relaxed_history_probe" safety valve now only triggers when there's no connected peer

### Additional Improvement
**File:** `server/src/integrations/mightycall.ts` — `fetchMightyCallLiveCallByExtension()`
- Added 2 more fallback strategies:
  1. Broad `/calls?extension=` query without Connected/Open filters (some MightyCall accounts need this)
  2. `/contactcenter/communications?type=Call` as a last resort

### What You Should Check
1. Open your browser's DevTools → Network tab
2. Go to the Live Status page
3. Look for requests to `/api/live-status`
4. Check the response — do you see your extension with `on_call: true` when on a call?
5. If not, check the server logs for `[live-status]` messages

---

## ISSUE 2: Recordings Not Showing

### Root Cause
The `mightycall_recordings` table has a **foreign key constraint** (`mightycall_recordings_call_id_fkey`) that requires `call_id` to reference a row in the `calls` table. Since recordings are synced independently and may not have matching call rows, ALL inserts fail with a FK violation.

### Fix Required — Run This SQL in Supabase

```sql
-- Step 1: Drop the FK constraint
ALTER TABLE public.mightycall_recordings
  DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;

-- Step 2: Make call_id nullable (in case it's currently NOT NULL)
ALTER TABLE public.mightycall_recordings
  ALTER COLUMN call_id DROP NOT NULL;

-- Step 3: Ensure the SMS table exists with correct schema
CREATE TABLE IF NOT EXISTS public.mightycall_sms_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  external_id text,
  from_number text,
  to_number text,
  message_text text,
  direction text,
  status text,
  sent_at timestamptz,
  message_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb,
  UNIQUE(org_id, external_id)
);

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_sms_org_id ON public.mightycall_sms_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_sms_sent_at ON public.mightycall_sms_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_external_id ON public.mightycall_sms_messages(external_id);
CREATE INDEX IF NOT EXISTS idx_recordings_org_id ON public.mightycall_recordings(org_id);
CREATE INDEX IF NOT EXISTS idx_recordings_recording_date ON public.mightycall_recordings(recording_date DESC);
```

### After Running SQL
1. Go to the Recordings page
2. Click "Refresh" to trigger a sync
3. Check if recordings appear
4. If they still don't appear, check the server console for `[MightyCall]` messages

---

## ISSUE 3: SMS Doesn't Show Direction

### Root Causes (Multiple)

**A. Direction parsing was incomplete**
The `directionFromText()` function didn't handle all MightyCall API response values like "sent", "received", "api", etc.

**Fix Applied:** Added more direction mappings in `server/src/integrations/mightycall.ts`

**B. Messages being quarantined due to ownership check**
The SMS sync function checks if the phone number in each message matches an "owned" phone number in the `phone_numbers` table. If no match, the message is quarantined instead of stored.

**Fix Applied:** Added `row?.type` as a fallback in the direction detection.

**C. The read endpoint also filters by ownership**
Even if messages ARE stored in the DB, the `/api/sms/messages` endpoint filters them through `normalizeSmsRowForOwnership()` which returns `null` if the phone number doesn't match.

### Critical Check — Phone Number Ownership
Run this in Supabase to check if your phone numbers are properly set up:

```sql
-- Check what phone numbers are registered for your org
SELECT id, number, label, org_id FROM phone_numbers WHERE org_id = 'YOUR_ORG_ID';

-- Check if any SMS messages are in the quarantine table
SELECT * FROM integration_quarantine WHERE integration_type = 'mightycall_sms_messages' LIMIT 10;

-- Check if any SMS messages exist in the main table
SELECT id, from_number, to_number, direction, created_at 
FROM mightycall_sms_messages 
ORDER BY created_at DESC 
LIMIT 10;
```

### If Phone Numbers Are Missing
If the `phone_numbers` table doesn't have your MightyCall numbers, the sync will quarantine everything. You need to:
1. Run the phone number sync first (it should auto-sync when you trigger a full MightyCall sync)
2. Or manually insert your phone numbers with the correct `org_id`

---

## How to Test All 3 Fixes

### 1. Live Status Test
1. Make sure the server is running with the updated code
2. Open the Live Status page
3. Make a test call from your MightyCall extension
4. The status should change to "On Call" within 5-10 seconds
5. Check server logs for `[live-status]` messages

### 2. Recordings Test
1. Run the SQL migration above in Supabase
2. Go to Recordings page
3. Click "Refresh" (triggers a sync)
4. Wait 30-60 seconds for the sync to complete
5. Refresh the page — recordings should appear

### 3. SMS Test
1. Run the SQL migration above in Supabase
2. Make sure your phone numbers are in the `phone_numbers` table
3. Go to SMS page
4. Click sync/refresh
5. Send a test SMS from MightyCall
6. Refresh — the message should appear with correct direction (Inbound/Outbound)

---

## Server Restart Required
After applying the code changes, restart your server:
```bash
cd server
npm run dev
# or
npm run build && npm start
```
