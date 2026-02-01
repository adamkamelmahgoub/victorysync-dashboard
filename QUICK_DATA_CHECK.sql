-- Quick test to see if there are ANY organizations
SELECT COUNT(*) as org_count FROM public.organizations;

-- See all orgs
SELECT id, name FROM public.organizations LIMIT 10;

-- See all org_users
SELECT org_id, user_id, role FROM public.org_users LIMIT 10;
