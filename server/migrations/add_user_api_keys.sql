-- Add can_generate_api_keys column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_generate_api_keys BOOLEAN DEFAULT true;

-- Create user_api_keys table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT user_api_keys_user_id_label UNIQUE (user_id, label)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);

-- Enable RLS if needed
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own API keys
CREATE POLICY IF NOT EXISTS user_api_keys_user_read ON user_api_keys
  FOR SELECT
  USING (user_id = auth.uid());

-- Allow admins to manage all API keys
CREATE POLICY IF NOT EXISTS user_api_keys_admin_all ON user_api_keys
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.global_role = 'platform_admin'
    )
  );
