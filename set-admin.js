#!/usr/bin/env node
/**
 * Script to set a user as platform admin
 * Run: node set-admin.js adam@victorysync.com
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './server/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function setAdmin(email) {
  try {
    console.log(`Setting ${email} as platform admin...`);

    // Get user by email
    const { data: { users }, error: fetchError } = await supabase.auth.admin.listUsers();
    
    if (fetchError) {
      console.error('Error fetching users:', fetchError);
      process.exit(1);
    }

    const user = users.find(u => u.email === email);
    if (!user) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    console.log(`Found user: ${user.id} (${user.email})`);

    // Update profiles table
    const { data, error } = await supabase
      .from('profiles')
      .update({ global_role: 'platform_admin' })
      .eq('id', user.id)
      .select();

    if (error) {
      console.error('Error updating profile:', error);
      process.exit(1);
    }

    console.log(`✓ Successfully set ${email} as platform admin`);
    console.log('Updated profile:', data);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node set-admin.js <email>');
  process.exit(1);
}

setAdmin(email);
