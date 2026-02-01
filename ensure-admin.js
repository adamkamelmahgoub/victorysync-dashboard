#!/usr/bin/env node
/**
 * Script to ensure user has a profile with platform admin role
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

async function ensureAdminProfile(email) {
  try {
    console.log(`Ensuring ${email} has platform admin profile...`);

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

    // Check if profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id, global_role')
      .eq('id', user.id)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking profile:', checkError);
      process.exit(1);
    }

    if (existingProfile) {
      // Update existing profile
      console.log(`Profile exists. Current role: ${existingProfile.global_role}`);
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ global_role: 'platform_admin' })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating profile:', updateError);
        process.exit(1);
      }
      console.log(`✓ Updated ${email} to platform_admin`);
    } else {
      // Create new profile
      console.log('Profile does not exist. Creating...');
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          global_role: 'platform_admin'
        });

      if (insertError) {
        console.error('Error creating profile:', insertError);
        process.exit(1);
      }
      console.log(`✓ Created platform_admin profile for ${email}`);
    }

    // Verify
    const { data: verified } = await supabase
      .from('profiles')
      .select('id, email, global_role')
      .eq('id', user.id)
      .single();

    console.log('Verified profile:', verified);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node ensure-admin.js <email>');
  process.exit(1);
}

ensureAdminProfile(email);
