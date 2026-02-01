# The "No Organization Linked" Bug - Complete Analysis

## Timeline of Investigation

### Step 1: Identified Frontend Code Issue ✅
**Problem:** OrgContext.tsx used `.single()` for org_users query
- `.single()` throws error if 0 rows (user not found)
- Conflated "no membership" with "query error"

**Fixed:** Changed to `.select()` for array returns
- Returns empty array if no match
- Properly distinguishes "no membership" from "query error"

### Step 2: Verified Frontend Logic Works ✅
**Debug Panel Evidence:**
- ✅ User authenticated
- ✅ org_users query returns 1 membership row
- ✅ Membership contains valid org_id
- ✅ User has role "org_admin"

### Step 3: Found RLS Policy Bug ❌ ← YOU ARE HERE
**Problem:** Organizations table query fails silently
- org_users returns data ✅
- organizations query returns 0 rows ❌
- Error: RLS policy denies access

**Root Cause:** Table Mismatch
- App uses: `org_users` table
- RLS checks: `org_members` table (different data!)
- User in `org_users` but not in `org_members`
- RLS function `is_org_member()` checks wrong table
- Returns FALSE → access denied

## Visual Diagram

```
User Login
    ↓
OrgContext.fetchOrgData()
    ↓
Query: SELECT * FROM org_users WHERE user_id = auth.uid()
    ↓
    ✅ Found 1 membership row
    ↓
Query: SELECT * FROM organizations WHERE id = membership.org_id
    ↓
RLS Policy: "organizations_member_read"
    using (public.is_org_member(id))
    ↓
RLS Function: is_org_member(org_id)
    SELECT 1 FROM org_members ← WRONG TABLE!
    WHERE user_id = auth.uid()
    ↓
    ❌ NO ROWS FOUND (user not in org_members!)
    ↓
RLS denies access
    ↓
organizations query returns 0 rows
    ↓
App sets org = null
    ↓
Dashboard shows: "No organization is linked"
```

## The Fix

**Change RLS Functions to Check `org_users` Instead of `org_members`**

Before:
```sql
-- is_org_member checks org_members table
select 1 from public.org_members  ← WRONG!
where org_members.org_id = $1 and user_id = auth.uid()
```

After:
```sql
-- is_org_member checks org_users table
select 1 from public.org_users  ← CORRECT!
where org_users.org_id = $1 and user_id = auth.uid()
```

## Result After Fix

```
User Login
    ↓
OrgContext.fetchOrgData()
    ↓
Query: SELECT * FROM org_users WHERE user_id = auth.uid()
    ↓
    ✅ Found 1 membership row
    ↓
Query: SELECT * FROM organizations WHERE id = membership.org_id
    ↓
RLS Policy: "organizations_member_read"
    using (public.is_org_member(id))
    ↓
RLS Function: is_org_member(org_id)
    SELECT 1 FROM org_users ← CORRECT TABLE!
    WHERE user_id = auth.uid()
    ↓
    ✅ FOUND 1 ROW
    ↓
RLS allows access
    ↓
organizations query returns org data
    ↓
App sets org = { id, name, ... }
    ↓
Dashboard displays organization content ✅
```

## Why This Bug Existed

The codebase has both:
1. **org_users** - Primary membership table (created in setup_org_scoping.sql)
2. **org_members** - Legacy table (created in add_rbac_and_phones.sql)

The app uses `org_users`, but RLS functions still referenced `org_members`.
This is a migration/refactoring issue where one wasn't updated after the other.

## Files Changed

1. **supabase/007_extend_org_schema_and_add_modules.sql**
   - Line 129: Fixed `is_org_member()` to check `org_users`
   - Line 137: Fixed `is_org_admin()` to check `org_users`

2. **supabase/008_fix_rls_functions_to_use_org_users.sql** (new)
   - Complete migration script with both functions

3. **client/src/contexts/OrgContext.tsx** (earlier fix)
   - Line 180: Changed `.single()` to `.select()`
   - Proper error handling for empty results

## Testing

**Debug Page:** http://localhost:3000/debug-auth
- Verify org_users shows membership
- Verify organizations shows data after RLS fix

**Production Test:**
- Refresh dashboard
- Should see org content instead of error

## Rollout Steps

1. Apply RLS fix in Supabase SQL Editor
2. Clear browser cache (Ctrl+Shift+Del)
3. Refresh dashboard
4. Verify org displays correctly

No frontend redeploy needed (fix is in Supabase backend only).
