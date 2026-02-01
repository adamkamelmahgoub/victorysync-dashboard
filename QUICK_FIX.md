# CRITICAL FIX - Apply Now!

## What's Broken
- Debug panel shows user HAS org membership in `org_users` table ✅
- But `organizations` query fails due to RLS policy issue ❌
- Root cause: RLS functions check wrong table (`org_members` instead of `org_users`)

## How to Fix (3 steps, 2 minutes)

### Step 1: Open Supabase SQL Editor
- Go to your Supabase project
- Click "SQL Editor" in left sidebar
- Click "New query"

### Step 2: Copy and Paste This Code
```sql
create or replace function public.is_org_member(org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_users
    where org_users.org_id = $1 and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer;

create or replace function public.is_org_admin(org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_users
    where org_users.org_id = $1 and user_id = auth.uid() and role in ('org_owner', 'org_admin', 'admin')
  );
end;
$$ language plpgsql security definer;
```

### Step 3: Click "Run" Button
- Wait for "Query succeeded" message
- Done! ✅

## Verify It Works
1. Go to http://localhost:3000/debug-auth
2. Check "organizations Query Result" section
3. Should show organization data (not empty)
4. Go to http://localhost:3000/dashboard
5. Should show org dashboard, not "No organization is linked" error

## File References
- SQL to run: `/APPLY_RLS_FIX_NOW.sql` in the project root
- Full explanation: `/RLS_FIX_GUIDE.md`
- Source code fixed: `client/src/contexts/OrgContext.tsx` (line 212+)

## Why This Works
- App queries `org_users` table for membership
- Supabase RLS policy for `organizations` table uses `is_org_member()` function
- Function now checks `org_users` table (same table as app uses)
- User's membership is found → RLS allows access → Dashboard loads
