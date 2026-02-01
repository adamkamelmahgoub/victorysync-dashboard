-- FIX: Replace org_members RLS policy that uses self-referential query
-- The original policy caused infinite recursion:
-- "org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())"

-- Drop the problematic policy
DROP POLICY IF EXISTS "org_members_org_read" ON public.org_members;

-- Create fixed policy that uses org_users table instead
CREATE POLICY "org_members_org_read"
ON public.org_members
FOR SELECT
USING (
  -- Check if user is member of the org via org_users table
  org_id IN (SELECT org_id FROM public.org_users WHERE user_id = auth.uid())
);

-- Also check the admin policy - it should use is_platform_admin() which is safe
-- If there are other policies, update them similarly

-- Test: This should now work without infinite recursion
-- SELECT * FROM public.org_members LIMIT 1;
