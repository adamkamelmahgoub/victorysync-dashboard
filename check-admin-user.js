#!/usr/bin/env node
/**
 * Check and setup admin user for testing
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'REDACTED_JWT_DO_NOT_USE';
const supabaseAdminKey = process.env.SUPABASE_SERVICE_KEY || 'REDACTED_JWT_DO_NOT_USE';

async function checkAdminUser() {
  try {
    const admin = createClient(supabaseUrl, supabaseAdminKey);
    
    console.log('🔍 Checking admin users...\n');

    // Get all profiles with global_role
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('id, global_role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching profiles:', error);
      return;
    }

    console.log(`Found ${profiles.length} profiles:`);
    profiles.slice(0, 10).forEach(p => {
      console.log(`  ${p.id.slice(0, 8)}... | role: ${p.global_role || 'none'}`);
    });

    // Find or create an admin user
    let adminUser = profiles.find(p => p.global_role === 'platform_admin' || p.global_role === 'admin');
    
    if (!adminUser && profiles.length > 0) {
      // Promote first user to admin for testing
      adminUser = profiles[0];
      console.log(`\n📝 Promoting user ${adminUser.id.slice(0, 8)}... to platform_admin`);
      
      const { error: updateError } = await admin
        .from('profiles')
        .update({ global_role: 'platform_admin' })
        .eq('id', adminUser.id);

      if (updateError) {
        console.error('Error updating profile:', updateError);
      } else {
        console.log('✅ User promoted to platform_admin');
      }
    }

    if (adminUser) {
      console.log(`\n✅ Admin user available: ${adminUser.id}`);
      console.log(`   Role: ${adminUser.global_role || 'none'}`);
    } else {
      console.log('\n⚠️ No admin user found and no profiles to promote');
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

checkAdminUser();
