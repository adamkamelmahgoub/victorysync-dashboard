-- IMMEDIATE FIX: Run this in Supabase SQL Editor to enable org dashboard access
-- This fixes the "No organization is linked" error

-- Step 1: Fix is_org_member function to check org_users table
create or replace function public.is_org_member(org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_users
    where org_users.org_id = $1 and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer;

-- Step 2: Fix is_org_admin function to check org_users table  
create or replace function public.is_org_admin(org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_users
    where org_users.org_id = $1 and user_id = auth.uid() and role in ('org_owner', 'org_admin', 'admin')
  );
end;
$$ language plpgsql security definer;

-- Step 3: Verify the fix works by testing with your user
-- Replace YOUR_ORG_ID with an actual org_id from org_users table
-- SELECT public.is_org_member('YOUR_ORG_ID'::uuid) as "Is Member?";
-- SELECT public.is_org_admin('YOUR_ORG_ID'::uuid) as "Is Admin?";

-- After running this, go back to http://localhost:3000/debug-auth to verify
-- You should now see organization data in "organizations Query Result"
