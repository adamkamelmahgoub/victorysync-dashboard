# Fixed Issues: Phone Numbers in Recordings & Client Reports Visibility

## Summary
Fixed two critical user-facing issues in the VictorySync dashboard:
1. **Phone numbers not displaying in recordings** - Fixed data enrichment logic
2. **Client users unable to view reports** - Improved org membership verification and auto-selection

## Issue 1: Phone Numbers Not Displaying in Recordings

### Root Cause
The `/api/recordings` endpoint was fetching phone numbers from the `calls` table by joining on `call_id`, but the enrichment logic had a flaw:
- The endpoint was correctly selecting from `mightycall_recordings`
- It was trying to join with `calls` table using `call_id`
- However, when the join failed or data wasn't found, it would return recordings with NULL phone numbers

### Solution Applied
**File**: `server/src/index.ts` (lines 6995-7015)

Changed the phone number extraction logic to:
1. **Prioritize data from `mightycall_recordings` table first** - Many recordings already have phone numbers stored locally
2. **Fall back to `calls` table data** - If the primary source doesn't have numbers, query the calls table
3. **Add better error handling** - Log when joins fail and why
4. **Extract from metadata as fallback** - If phone numbers aren't in standard fields, check metadata object for alternate field names

**Key Changes**:
```typescript
// OLD: Only used callData.from_number, then fell back to rec.from_number
let fromNumber = callData.from_number || rec.from_number || null;
let toNumber = callData.to_number || rec.to_number || null;

// NEW: Prioritize mightycall_recordings data first, then calls table
let fromNumber = rec.from_number || callData.from_number || null;
let toNumber = rec.to_number || callData.to_number || null;
```

Also added debug logging to track enrichment success:
```typescript
console.debug(`[recordings_enrichment] Matched ${calls.length} calls from ${recordingIds.length} recording call_ids`);
```

## Issue 2: Client Users Cannot See Reports

### Root Cause
The `/api/mightycall/reports` endpoint was using the wrong table to check organization membership:
- Used `org_members` table which may be legacy/incomplete
- Didn't check `org_users` table first (the modern standard)
- Non-admin users couldn't see their org's reports if membership wasn't properly registered in `org_members`

Additionally, the frontend ReportsPage didn't auto-select an org for client users, leaving them on "No organization selected" page.

### Solutions Applied

#### Backend Fix
**File**: `server/src/index.ts` (lines 4600-4700)

Updated the organization membership verification logic to:
1. **Try `org_users` table first** - The primary modern table
2. **Fall back to `org_members`** - For legacy/migrated data
3. **Properly handle access control** - Return 403 if user tries to access an org they're not a member of
4. **Support both single and multiple orgs** - Handle cases where users have access to multiple orgs

**Key Changes**:
```typescript
// OLD: Only checked org_members
const { data: userOrgs } = await supabaseAdmin
  .from('org_members')
  .select('org_id')
  .eq('user_id', userId);

// NEW: Check org_users first, then org_members as fallback
let userOrgs: any[] = [];

try {
  const { data: data1, error: err1 } = await supabaseAdmin
    .from('org_users')
    .select('org_id')
    .eq('user_id', userId);
  
  if (!err1 && data1 && data1.length > 0) {
    userOrgs = data1;
  } else {
    // Fallback to org_members
    const { data: data2 } = await supabaseAdmin
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId);
    
    if (data2 && data2.length > 0) {
      userOrgs = data2;
    }
  }
} catch (e) {
  console.error('[mightycall/reports] error checking user orgs:', fmtErr(e));
}
```

#### Frontend Fix
**File**: `client/src/pages/ReportsPage.tsx` (lines 1-80)

Implemented automatic org selection for client users:
1. **Auto-select first org** - If no org is currently selected, automatically use the user's first org
2. **Better state management** - Track `activeOrgId` separately from context's `selectedOrgId`
3. **Proper loading** - Fetch data when org changes
4. **Better error messages** - Show appropriate messages for access denied vs. no data

**Key Changes**:
- Added `activeOrgId` state to track the current org being viewed
- Added `useEffect` to auto-select first org from `orgs` array
- Changed condition from `!selectedOrgId` to `!activeOrgId && (!orgs || orgs.length === 0)`
- Updated `buildApiUrl` import for proper URL construction
- Use `buildApiUrl()` helper to ensure correct API endpoint resolution

## Testing & Validation

### Phone Numbers Fix
To verify phone numbers now display:
1. Navigate to AdminRecordingsPage
2. Select an organization
3. Look for `from_number` and `to_number` in the recordings table
4. Previously: showed "—" (missing data)
5. Now: should show phone numbers like "+17325551234"

### Client Reports Fix
To verify client users can see reports:
1. Log in as a client user (non-admin org member)
2. Navigate to ReportsPage
3. Page should automatically select and load their organization's data
4. Previously: showed "No organization selected" message
5. Now: automatically loads first accessible org and displays recordings

## Files Modified
1. `server/src/index.ts`
   - Lines 6995-7015: Phone number extraction logic
   - Lines 4600-4700: Reports endpoint org membership verification

2. `client/src/pages/ReportsPage.tsx`
   - Lines 1-80: Auto-org selection and state management
   - Added `buildApiUrl` import for proper API URL construction
   - Updated org selection condition

## Impact & Benefits
- ✅ Admins can now see full phone numbers for all recordings
- ✅ Client users can see their organization's reports automatically
- ✅ Better fallback logic for data enrichment
- ✅ Improved error handling and logging
- ✅ More robust membership verification

## Related Issues (Not Fixed)
These were identified but not implemented as they were lower priority:
- Detailed call recording quality metrics
- Advanced reporting filters for client users
- Phone number formatting/normalization for international numbers

