# RLS FIX: org_users vs org_members Table Mismatch

## The Problem

The app shows "No organization is linked to your account" even though:
1. User exists in Supabase Auth
2. User has a row in `org_users` table with valid org membership
3. But `organizations` table queries return empty due to RLS policy failure

## Root Cause

**Table Mismatch:**
- Frontend app queries `org_users` table to check org membership
- Supabase RLS functions (`is_org_member`, `is_org_admin`) check `org_members` table
- These are two different tables with different data
- User exists in `org_users` but NOT in `org_members`
- RLS policy denies access to `organizations` table because `is_org_member()` returns FALSE

## The Fix

Updated RLS functions in Supabase to check `org_users` table instead of `org_members`:

### File: `supabase/008_fix_rls_functions_to_use_org_users.sql`

**Old code (checked org_members):**
```sql
create or replace function public.is_org_member(org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_members
    where org_members.org_id = $1 and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer;
```

**New code (checks org_users):**
```sql
create or replace function public.is_org_member(org_id uuid)
returns boolean as $$
begin
  -- Check org_users table (primary membership table used by the app)
  return exists (
    select 1 from public.org_users
    where org_users.org_id = $1 and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer;
```

Same fix applied to `is_org_admin()` function.

## How to Apply

1. Go to Supabase SQL Editor
2. Copy the contents of `supabase/008_fix_rls_functions_to_use_org_users.sql`
3. Paste and run the query
4. Test by refreshing the dashboard

## Expected Result

After applying this fix:
1. RLS function `is_org_member(org_id)` now correctly checks `org_users` table
2. `organizations` table RLS policy allows access for users with `org_users` membership
3. Frontend `OrgContext.fetchOrgData()` successfully fetches organization details
4. Dashboard displays org name and content instead of "No organization is linked"

## Tables Summary

| Table | Purpose | App Usage | RLS Function |
|-------|---------|-----------|--------------|
| `org_users` | Explicit user-org assignments | Primary table (used by frontend) | `is_org_member()` ← CHECK THIS |
| `org_members` | Legacy membership table | Legacy/migration | Not used |
| `organizations` | Org details | Fetch org data | Uses `is_org_member()` to gate access |

## Related Files Modified

- `client/src/contexts/OrgContext.tsx` - Changed `.single()` to `.select()` for array returns
- `client/src/lib/supabaseClient.ts` - Added debug logging for Supabase URL
- `client/src/pages/DebugAuthPage.tsx` - Created debug page to diagnose RLS vs logic issues
