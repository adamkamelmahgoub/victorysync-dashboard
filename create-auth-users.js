#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

// Use service role key for admin operations
const supabase = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE',
  { auth: { persistSession: false } }
);

// Fixed UUIDs for testing
const TEST_CLIENT_UUID = '11111111-1111-1111-1111-111111111111';
const TEST_ADMIN_UUID = '22222222-2222-2222-2222-222222222222';

// Org IDs
const TEST_CLIENT_ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf'; // Test Client1
const VICTORYSYNC_ORG = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';  // VictorySync

async function createUsers() {
  console.log('👤 Creating Supabase Auth users...\n');

  try {
    // Step 1: Create test@test.com user
    console.log('1️⃣  Creating test@test.com...');
    try {
      const { data: clientUser, error: clientError } = await supabase.auth.admin.createUser({
        email: 'test@test.com',
        password: 'Test123!@#',
        user_metadata: {
          display_name: 'Test Client',
          role: 'agent'
        },
        email_confirm: true
      });
      
      if (clientError) {
        console.error('   ❌ Error:', clientError.message);
        if (clientError.message.includes('already exists')) {
          console.log('   ℹ️  User already exists, using existing UUID');
        }
      } else {
        console.log(`   ✅ Created: ${clientUser.user.id}`);
        console.log(`      Email: ${clientUser.user.email}`);
      }
    } catch (e) {
      console.error('   ❌ Exception:', e.message);
    }

    // Step 2: Create adam@victorysync.com user
    console.log('\n2️⃣  Creating adam@victorysync.com...');
    try {
      const { data: adminUser, error: adminError } = await supabase.auth.admin.createUser({
        email: 'adam@victorysync.com',
        password: 'Adam123!@#',
        user_metadata: {
          display_name: 'Adam Victory',
          role: 'org_admin'
        },
        email_confirm: true
      });
      
      if (adminError) {
        console.error('   ❌ Error:', adminError.message);
        if (adminError.message.includes('already exists')) {
          console.log('   ℹ️  User already exists, using existing UUID');
        }
      } else {
        console.log(`   ✅ Created: ${adminUser.user.id}`);
        console.log(`      Email: ${adminUser.user.email}`);
      }
    } catch (e) {
      console.error('   ❌ Exception:', e.message);
    }

    // Step 3: Get the actual UUIDs from auth
    console.log('\n3️⃣  Retrieving user UUIDs from Supabase Auth...');
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    let clientUUID = null;
    let adminUUID = null;
    
    if (listError) {
      console.error('   ❌ Error fetching users:', listError.message);
    } else {
      const clientAuthUser = users.users.find(u => u.email === 'test@test.com');
      const adminAuthUser = users.users.find(u => u.email === 'adam@victorysync.com');
      
      if (clientAuthUser) {
        clientUUID = clientAuthUser.id;
        console.log(`   ✅ test@test.com UUID: ${clientUUID}`);
      } else {
        console.log('   ❌ test@test.com not found in auth');
      }
      
      if (adminAuthUser) {
        adminUUID = adminAuthUser.id;
        console.log(`   ✅ adam@victorysync.com UUID: ${adminUUID}`);
      } else {
        console.log('   ❌ adam@victorysync.com not found in auth');
      }
    }

    // Step 4: Now add them to org_users with correct UUIDs
    if (clientUUID) {
      console.log(`\n4️⃣  Adding test@test.com to org_users...`);
      const { error: addClientError } = await supabase
        .from('org_users')
        .upsert({
          user_id: clientUUID,
          org_id: TEST_CLIENT_ORG,
          role: 'agent',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,org_id' });
      
      if (addClientError) {
        console.error('   ❌ Error:', addClientError.message);
      } else {
        console.log('   ✅ Added to Test Client1 org');
      }
    }

    if (adminUUID) {
      console.log(`\n5️⃣  Adding adam@victorysync.com to org_users...`);
      const { error: addAdminError } = await supabase
        .from('org_users')
        .upsert({
          user_id: adminUUID,
          org_id: VICTORYSYNC_ORG,
          role: 'org_admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,org_id' });
      
      if (addAdminError) {
        console.error('   ❌ Error:', addAdminError.message);
      } else {
        console.log('   ✅ Added to VictorySync org as org_admin');
      }
    }

    // Step 5: Final summary
    console.log('\n' + '='.repeat(70));
    console.log('✅ SETUP COMPLETE');
    console.log('='.repeat(70));
    
    if (clientUUID && adminUUID) {
      console.log(`
Test API with the following commands:

1. CLIENT (test@test.com) with ${clientRecordings || 'N/A'} recordings:
   curl -H "x-user-id: ${clientUUID}" \\
        http://localhost:4000/api/recordings?org_id=${TEST_CLIENT_ORG}

2. ADMIN (adam@victorysync.com) with ${adminRecordings || 'N/A'} recordings:
   curl -H "x-user-id: ${adminUUID}" \\
        http://localhost:4000/api/recordings?org_id=${VICTORYSYNC_ORG}
      `);
    }

    process.exit(0);
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

createUsers();
