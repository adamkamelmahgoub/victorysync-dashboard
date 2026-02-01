-- Diagnostic queries to understand the data state

-- 1. Check if org_users table has data
SELECT 'org_users' as table_name, COUNT(*) as row_count FROM public.org_users;

-- 2. Check if organizations table has data
SELECT 'organizations' as table_name, COUNT(*) as row_count FROM public.organizations;

-- 3. Show all orgs for current user
SELECT org_id, role FROM public.org_users WHERE user_id = auth.uid();

-- 4. Show org details for each membership
SELECT o.id, o.name, ou.role 
FROM public.organizations o
INNER JOIN public.org_users ou ON o.id = ou.org_id
WHERE ou.user_id = auth.uid();

-- 5. Check RLS function results directly
SELECT public.is_org_member(id) as user_is_member
FROM public.organizations 
LIMIT 5;
