-- ============================================================
-- SQL Setup for VictorySync Users
-- ============================================================
-- This script sets up two test users with proper UUID mappings:
-- 1. test@test.com - Regular client user
-- 2. adam@victorysync.com - Admin user

-- Generated UUIDs:
-- test@test.com UUID: 11111111-1111-1111-1111-111111111111
-- adam@victorysync.com UUID: 22222222-2222-2222-2222-222222222222

-- ============================================================
-- Step 1: Insert users into auth.users (if you have access)
-- ============================================================
-- Note: This requires direct auth admin access to Supabase
-- If you can't run this, create users via Supabase Dashboard UI instead

INSERT INTO auth.users (id, email, email_confirmed_at, encrypted_password, created_at, updated_at)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'test@test.com', now(), 'hashed_password_here', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'adam@victorysync.com', now(), 'hashed_password_here', now(), now())
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- Step 2: Add test@test.com as client to Test Client1 org
-- ============================================================
INSERT INTO org_users (user_id, org_id, role, created_at, updated_at)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'd6b7bbde-54bb-4782-989d-cf9093f8cadf', 'agent', now(), now())
ON CONFLICT DO NOTHING;

-- ============================================================
-- Step 3: Add adam@victorysync.com as admin to VictorySync org
-- ============================================================
INSERT INTO org_users (user_id, org_id, role, created_at, updated_at)
VALUES 
  ('22222222-2222-2222-2222-222222222222', 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1', 'org_admin', now(), now())
ON CONFLICT DO NOTHING;

-- ============================================================
-- Step 4: ALTERNATIVE - If direct auth access fails
-- ============================================================
-- Create a users metadata table to map emails to UUIDs
-- (if your auth system needs this)

CREATE TABLE IF NOT EXISTS user_email_mapping (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

INSERT INTO user_email_mapping (user_id, email)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'test@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'adam@victorysync.com')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- Verification Queries
-- ============================================================
-- Run these to verify the setup:

-- Check org_users entries:
SELECT user_id, org_id, role FROM org_users 
WHERE user_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- Check if users can see recordings:
SELECT mr.id, mr.org_id, mr.recording_url
FROM mightycall_recordings mr
WHERE mr.org_id = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf'
LIMIT 5;

-- Check org info:
SELECT id, name FROM organizations 
WHERE id IN ('d6b7bbde-54bb-4782-989d-cf9093f8cadf', 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1');
