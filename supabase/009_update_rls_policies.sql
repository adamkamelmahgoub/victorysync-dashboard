-- Update RLS policies to support both role and global_role
-- Drop existing policies on org_users
DROP POLICY IF EXISTS "org_users_admin_all" ON public.org_users;
DROP POLICY IF EXISTS "org_users_user_read" ON public.org_users;

-- Admin can read/write all (check both role and global_role)
CREATE POLICY "org_users_admin_all"
ON public.org_users
FOR ALL
USING (
  (select user_metadata ->> 'role' from auth.users where id = auth.uid()) = 'admin'
  OR (select user_metadata ->> 'global_role' from auth.users where id = auth.uid()) = 'admin'
)
WITH CHECK (
  (select user_metadata ->> 'role' from auth.users where id = auth.uid()) = 'admin'
  OR (select user_metadata ->> 'global_role' from auth.users where id = auth.uid()) = 'admin'
);

-- Users can read assignments for their org (check org_id in metadata)
CREATE POLICY "org_users_user_read"
ON public.org_users
FOR SELECT
USING (
  user_id = auth.uid()
  OR org_id = (select user_metadata ->> 'org_id' from auth.users where id = auth.uid())::uuid
);

-- Update RLS policies on calls table similarly
DROP POLICY IF EXISTS "calls_admin_all" ON public.calls;
DROP POLICY IF EXISTS "calls_user_read_own_org" ON public.calls;

-- Admin can read all calls
CREATE POLICY "calls_admin_all"
ON public.calls
FOR SELECT
USING (
  (select user_metadata ->> 'role' from auth.users where id = auth.uid()) = 'admin'
  OR (select user_metadata ->> 'global_role' from auth.users where id = auth.uid()) = 'admin'
);

-- Users can read calls from their org only
CREATE POLICY "calls_user_read_own_org"
ON public.calls
FOR SELECT
USING (
  org_id = (select user_metadata ->> 'org_id' from auth.users where id = auth.uid())::uuid
);
