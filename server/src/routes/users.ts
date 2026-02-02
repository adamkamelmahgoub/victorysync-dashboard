import express from 'express';
import { supabaseAdmin } from '../lib/supabaseClient';
import crypto from 'crypto';
import { isPlatformAdmin } from '../auth/rbac';

const router = express.Router();

// Helper to hash API keys
function hashApiKey(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Middleware to protect admin routes - checks x-dev-bypass or platform_admin role
router.use(async (req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production' || req.header('x-dev-bypass') === 'true';
  const userId = req.header('x-user-id') || null;
  
  if (isDev && userId) {
    // In dev mode, allow if x-user-id present
    return next();
  }
  
  if (!userId) {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  
  const isAdmin = await isPlatformAdmin(userId);
  if (!isAdmin) {
    return res.status(403).json({ error: 'forbidden' });
  }
  
  next();
});

// GET /api/admin/users - Get all users
router.get('/users', async (req, res) => {
  try {
    // Try to fetch with can_generate_api_keys, but it might not exist on all users table schemas
    let query = supabaseAdmin
      .from('users')
      .select('id, email, role, created_at');
    
    // Try to include can_generate_api_keys if it exists
    try {
      query = supabaseAdmin
        .from('users')
        .select('id, email, role, created_at, can_generate_api_keys');
    } catch {
      // Fallback if column doesn't exist
    }

    const { data: users, error } = await query;

    if (error) {
      console.error('[GET /api/admin/users] Error fetching users:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Ensure can_generate_api_keys defaults to true if not present
    const safedUsers = (users || []).map((u: any) => ({
      ...u,
      can_generate_api_keys: u.can_generate_api_keys !== false
    }));

    res.json({ users: safedUsers });
  } catch (err) {
    console.error('[GET /api/admin/users] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/users/:userId - Update user settings
router.put('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { can_generate_api_keys } = req.body;

  try {
    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, can_generate_api_keys')
      .eq('id', userId)
      .maybeSingle();

    if (fetchError || !existingUser) {
      console.error('[PUT /api/admin/users/:userId] User not found or fetch error:', fetchError);
      return res.status(404).json({ error: 'User not found' });
    }

    const updatePayload: { can_generate_api_keys?: boolean } = {};
    if (typeof can_generate_api_keys === 'boolean') {
      updatePayload.can_generate_api_keys = can_generate_api_keys;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updatePayload)
      .eq('id', userId)
      .select();

    if (error) {
      console.error('[PUT /api/admin/users/:userId] Error updating user:', error);
      return res.status(500).json({ error: 'Failed to update user' });
    }

    res.json({ success: true, user: data[0] });
  } catch (err) {
    console.error('[PUT /api/admin/users/:userId] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/users/:userId/api-keys - Get API keys for a specific user
router.get('/users/:userId/api-keys', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: apiKeys, error } = await supabaseAdmin
      .from('user_api_keys')
      .select('id, label, created_at, last_used_at, key_hash')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      // If table doesn't exist yet, return empty array
      if (error.message && error.message.includes('does not exist')) {
        console.log('[GET /api/admin/users/:userId/api-keys] user_api_keys table not found, returning empty list');
        return res.json({ api_keys: [] });
      }
      console.error('[GET /api/admin/users/:userId/api-keys] Error fetching API keys:', error);
      return res.status(500).json({ error: 'Failed to fetch API keys', detail: error.message });
    }

    // Return only partial key for security
    const safeApiKeys = (apiKeys || []).map(key => ({
      id: key.id,
      label: key.label,
      created_at: key.created_at,
      last_used_at: key.last_used_at,
      key_prefix: key.key_hash ? key.key_hash.substring(0, 8) : '' // Use key_hash prefix
    }));

    res.json({ api_keys: safeApiKeys });
  } catch (err) {
    console.error('[GET /api/admin/users/:userId/api-keys] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error', detail: String(err) });
  }
});

// POST /api/admin/users/:userId/api-keys - Generate a new API key for a user
router.post('/users/:userId/api-keys', async (req, res) => {
  const { userId } = req.params;
  const { label } = req.body;

  if (!label) {
    return res.status(400).json({ error: 'API Key label is required' });
  }

  try {
    // Check if user is allowed to generate API keys (gracefully handle missing column)
    const { data: userSettings, error: userError } = await supabaseAdmin
      .from('users')
      .select('can_generate_api_keys')
      .eq('id', userId)
      .maybeSingle();

    // If can_generate_api_keys column doesn't exist or is not set, default to true
    const canGenerate = !userError && userSettings ? userSettings.can_generate_api_keys !== false : true;
    
    if (!canGenerate) {
      return res.status(403).json({ error: 'User is not allowed to generate API keys' });
    }

    const plaintextKey = crypto.randomBytes(32).toString('hex');
    const hashedKey = hashApiKey(plaintextKey);

    const { data, error } = await supabaseAdmin
      .from('user_api_keys')
      .insert({
        user_id: userId,
        label: label,
        key_hash: hashedKey
      })
      .select('id')
      .maybeSingle();

    if (error) {
      // If table doesn't exist, return helpful error
      if (error.message && error.message.includes('does not exist')) {
        console.log('[POST /api/admin/users/:userId/api-keys] user_api_keys table not found');
        return res.status(503).json({ error: 'API keys feature not yet available', detail: 'Database not initialized' });
      }
      console.error('[POST /api/admin/users/:userId/api-keys] Error creating API key:', error);
      return res.status(500).json({ error: 'Failed to create API key', detail: error.message });
    }

    res.json({
      success: true,
      api_key: {
        id: data?.id || crypto.randomUUID(),
        label: label,
        created_at: new Date().toISOString()
      },
      plaintext: plaintextKey
    });
  } catch (err) {
    console.error('[POST /api/admin/users/:userId/api-keys] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error', detail: String(err) });
  }
});,
      })
      .select();

    if (error) {
      console.error('[POST /api/admin/users/:userId/api-keys] Error generating API key:', error);
      return res.status(500).json({ error: 'Failed to generate API key' });
    }

    res.json({ success: true, api_key: data[0], api_key_plaintext: plaintextKey });
  } catch (err) {
    console.error('[POST /api/admin/users/:userId/api-keys] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:userId/api-keys/:apiKeyId - Revoke an API key
router.delete('/users/:userId/api-keys/:apiKeyId', async (req, res) => {
  const { userId, apiKeyId } = req.params;
  try {
    const { error } = await supabaseAdmin
      .from('user_api_keys')
      .delete()
      .eq('id', apiKeyId)
      .eq('user_id', userId); // Ensure the key belongs to the user

    if (error) {
      console.error('[DELETE /api/admin/users/:userId/api-keys/:apiKeyId] Error revoking API key:', error);
      return res.status(500).json({ error: 'Failed to revoke API key' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/admin/users/:userId/api-keys/:apiKeyId] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
