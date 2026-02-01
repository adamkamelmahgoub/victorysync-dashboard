-- Add global_role column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS global_role TEXT;

-- Set adam@victorysync.com as platform admin
UPDATE profiles 
SET global_role = 'admin' 
WHERE id = (SELECT id FROM auth.users WHERE email = 'adam@victorysync.com');

-- If profile doesn't exist, create it
INSERT INTO profiles (id, global_role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'adam@victorysync.com'
  AND id NOT IN (SELECT id FROM profiles);
