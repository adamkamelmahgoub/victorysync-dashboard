-- ============================================================
-- SUPABASE USER & ORGANIZATION SETUP QUERIES
-- Run these SQL queries in Supabase SQL Editor if needed
-- ============================================================

-- ============================================================
-- VERIFICATION QUERIES (Run these first to check current state)
-- ============================================================

-- Check if users exist in org_users
SELECT 'User Mappings:' as check_type,
       u.user_id, 
       u.org_id, 
       u.role,
       o.name as org_name
FROM org_users u
LEFT JOIN organizations o ON u.org_id = o.id
WHERE u.user_id IN ('aece18dd-8a3c-4950-97a6-d7eeabe26e4a', 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a')
ORDER BY u.created_at DESC;

-- Count recordings per org
SELECT 'Recording Counts:' as check_type,
       org_id,
       COUNT(*) as total_recordings
FROM mightycall_recordings
WHERE org_id IN ('d6b7bbde-54bb-4782-989d-cf9093f8cadf', 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1')
GROUP BY org_id;

-- Check org details
SELECT 'Organizations:' as check_type,
       id,
       name,
       created_at
FROM organizations
WHERE id IN ('d6b7bbde-54bb-4782-989d-cf9093f8cadf', 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1');

-- ============================================================
-- SETUP QUERIES (If users don't exist, run these)
-- ============================================================

-- Add test@test.com (client) to Test Client1 org
INSERT INTO org_users (user_id, org_id, role, created_at, updated_at)
VALUES (
  'aece18dd-8a3c-4950-97a6-d7eeabe26e4a',
  'd6b7bbde-54bb-4782-989d-cf9093f8cadf',
  'agent',
  now(),
  now()
)
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Add adam@victorysync.com (admin) to VictorySync org
INSERT INTO org_users (user_id, org_id, role, created_at, updated_at)
VALUES (
  'a5f6f998-5ed5-4c0c-88ac-9f27d677697a',
  'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
  'org_admin',
  now(),
  now()
)
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ============================================================
-- EXTENDED SETUP (If you need to add more users to other orgs)
-- ============================================================

-- Template for adding users to additional orgs
-- Uncomment and modify as needed:

-- INSERT INTO org_users (user_id, org_id, role, created_at, updated_at)
-- VALUES (
--   'aece18dd-8a3c-4950-97a6-d7eeabe26e4a',  -- test@test.com UUID
--   'YOUR_ORG_UUID_HERE',
--   'agent',
--   now(),
--   now()
-- )
-- ON CONFLICT (user_id, org_id) DO NOTHING;

-- ============================================================
-- USEFUL QUERIES FOR TROUBLESHOOTING
-- ============================================================

-- List all users in an organization
SELECT 'Users in Organization' as info,
       ou.user_id,
       ou.role,
       ou.created_at
FROM org_users ou
WHERE ou.org_id = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf'
ORDER BY ou.created_at DESC;

-- List all organizations a user belongs to
SELECT 'Orgs for test@test.com' as info,
       ou.org_id,
       o.name,
       ou.role
FROM org_users ou
LEFT JOIN organizations o ON ou.org_id = o.id
WHERE ou.user_id = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';

-- Check sample recordings from Test Client1
SELECT 'Sample Recordings (Test Client1)' as info,
       id,
       phone_number_id,
       call_id,
       recording_url,
       duration_seconds,
       recording_date
FROM mightycall_recordings
WHERE org_id = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf'
ORDER BY recording_date DESC
LIMIT 5;

-- Check sample recordings from VictorySync
SELECT 'Sample Recordings (VictorySync)' as info,
       id,
       phone_number_id,
       call_id,
       recording_url,
       duration_seconds,
       recording_date
FROM mightycall_recordings
WHERE org_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'
ORDER BY recording_date DESC
LIMIT 5;

-- ============================================================
-- USER DETAILS FOR REFERENCE
-- ============================================================

/*
test@test.com
- UUID: aece18dd-8a3c-4950-97a6-d7eeabe26e4a
- Organization: Test Client1
- Org UUID: d6b7bbde-54bb-4782-989d-cf9093f8cadf
- Role: agent (regular client)
- Recordings Available: 2,690

adam@victorysync.com
- UUID: a5f6f998-5ed5-4c0c-88ac-9f27d677697a
- Organization: VictorySync
- Org UUID: cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1
- Role: org_admin (administrator)
- Recordings Available: 2,599
*/
