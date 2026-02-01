-- SUPABASE RLS FIX - This fixes the "No organization is linked" error for org users
-- Step 1: Create the fixed is_org_member function
-- This function checks if a user is a member of an organization
-- BEFORE: Checked org_members table (wrong!)
-- AFTER: Checks org_users table (correct!)

create or replace function public.is_org_member(org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_users
    where org_users.org_id = $1 and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer;

-- ============================================================================
-- STEP 2: Create the fixed is_org_admin function  
-- ============================================================================
-- This function checks if a user is an admin of an organization
-- BEFORE: Checked org_members table with ('owner', 'admin') roles
-- AFTER: Checks org_users table with ('org_owner', 'org_admin', 'admin') roles

create or replace function public.is_org_admin(org_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.org_users
    where org_users.org_id = $1 
      and user_id = auth.uid() 
      and role in ('org_owner', 'org_admin', 'admin')
  );
end;
$$ language plpgsql security definer;

-- ============================================================================
-- OPTIONAL: Verify the fix works
-- ============================================================================
-- After running the above queries, you can test with these commands:
-- Replace 'YOUR_ORG_ID' with an actual org UUID from the org_users table

-- Test membership:
-- SELECT public.is_org_member('YOUR_ORG_ID'::uuid) as "User is member?";

-- Test admin:
-- SELECT public.is_org_admin('YOUR_ORG_ID'::uuid) as "User is admin?";

-- Or see all orgs for current user:
-- SELECT org_id, role FROM public.org_users WHERE user_id = auth.uid();

-- ============================================================================
-- DONE!
-- ============================================================================
-- After running these queries successfully, refresh http://localhost:3000
-- Your dashboard should now display the organization instead of the error.
