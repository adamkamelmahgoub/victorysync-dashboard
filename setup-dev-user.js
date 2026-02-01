#!/usr/bin/env node
/**
 * Development Setup Script
 * Creates a test user for local development and testing
 * Usage: node setup-dev-user.js
 */

require('dotenv').config({ path: './server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in server/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_EMAIL = 'demo@victorysync.com';
const TEST_PASSWORD = 'Demo@12345';
const TEST_ORG_ID = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

(async () => {
  try {
    console.log('🔧 Setting up test user for development...');
    console.log(`   Email: ${TEST_EMAIL}`);
    console.log(`   Org: ${TEST_ORG_ID}`);
    
    // 1. Check if user already exists
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    
    let testUser = users?.find(u => u.email === TEST_EMAIL);
    
    if (!testUser) {
      console.log(`\n📧 Creating user ${TEST_EMAIL}...`);
      const { data, error } = await supabase.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: {
          org_id: TEST_ORG_ID,
          role: 'agent',
          global_role: 'user'
        }
      });
      
      if (error) throw error;
      testUser = data.user;
      console.log(`✅ User created with ID: ${testUser.id}`);
    } else {
      console.log(`\n✓ User already exists with ID: ${testUser.id}`);
      
      // Update metadata to ensure they have the org
      const { data, error } = await supabase.auth.admin.updateUserById(testUser.id, {
        user_metadata: {
          org_id: TEST_ORG_ID,
          role: 'agent',
          global_role: 'user'
        }
      });
      if (error) throw error;
      console.log(`✅ User metadata updated`);
    }
    
    // 2. Ensure org_users record exists
    const { data: orgUsers, error: checkErr } = await supabase
      .from('org_users')
      .select('*')
      .eq('user_id', testUser.id)
      .eq('org_id', TEST_ORG_ID);
    
    if (checkErr) throw checkErr;
    
    if (!orgUsers || orgUsers.length === 0) {
      console.log(`\n👥 Creating org_users record...`);
      const { data, error } = await supabase
        .from('org_users')
        .insert([{
          user_id: testUser.id,
          org_id: TEST_ORG_ID,
          role: 'agent'
        }])
        .select();
      
      if (error) throw error;
      console.log(`✅ org_users record created`);
    } else {
      console.log(`\n✓ org_users record already exists`);
    }
    
    console.log(`\n🎉 Setup complete! You can now log in with:`);
    console.log(`   Email: ${TEST_EMAIL}`);
    console.log(`   Password: ${TEST_PASSWORD}`);
    console.log(`\n📍 Go to http://localhost:3000 and log in to access the dashboard.`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
})();
