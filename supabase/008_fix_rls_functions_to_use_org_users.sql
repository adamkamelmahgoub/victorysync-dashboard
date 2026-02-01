-- Fix RLS functions to check org_users table instead of org_members
-- The app uses org_users table for org membership, but RLS functions were checking org_members
-- This mismatch caused "No organization is linked" errors even when membership existed

-- 1) Fix is_org_member function
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

-- 2) Fix is_org_admin function  
create or replace function public.is_org_admin(org_id uuid)
returns boolean as $$
begin
  -- Check org_users table (primary membership table used by the app)
  return exists (
    select 1 from public.org_users
    where org_users.org_id = $1 and user_id = auth.uid() and role in ('org_owner', 'org_admin', 'admin')
  );
end;
$$ language plpgsql security definer;

-- Test that the functions now work with org_users
-- SELECT public.is_org_member('YOUR_ORG_ID'::uuid);
-- SELECT public.is_org_admin('YOUR_ORG_ID'::uuid);
