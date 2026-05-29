#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE',
  { auth: { persistSession: false } }
);

// Fixed UUIDs for testing
const TEST_CLIENT_UUID = '11111111-1111-1111-1111-111111111111';
const TEST_ADMIN_UUID = '22222222-2222-2222-2222-222222222222';

// Org IDs (from analysis)
const TEST_CLIENT_ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf'; // Test Client1
const VICTORYSYNC_ORG = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';  // VictorySync

async function setupUsers() {
  console.log('🔧 Setting up test users in Supabase...\n');

  try {
    // Step 1: Check if users already exist in org_users
    console.log('1️⃣  Checking existing org_users entries...');
    const { data: existing } = await supabase
      .from('org_users')
      .select('user_id, org_id, role')
      .in('user_id', [TEST_CLIENT_UUID, TEST_ADMIN_UUID]);
    
    if (existing && existing.length > 0) {
      console.log(`   ✅ Found ${existing.length} existing entries`);
      existing.forEach(e => {
        console.log(`      - ${e.user_id} in org ${e.org_id} (${e.role})`);
      });
    } else {
      console.log('   ⚠️  No existing entries found - will create new ones\n');
    }

    // Step 2: Add test@test.com as client
    console.log('2️⃣  Adding test@test.com as client...');
    const { error: clientError } = await supabase
      .from('org_users')
      .upsert({
        user_id: TEST_CLIENT_UUID,
        org_id: TEST_CLIENT_ORG,
        role: 'agent',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,org_id' });
    
    if (clientError) {
      console.error('   ❌ Error:', clientError.message);
    } else {
      console.log('   ✅ Added/updated successfully');
      console.log(`      UUID: ${TEST_CLIENT_UUID}`);
      console.log(`      Email: test@test.com`);
      console.log(`      Org: ${TEST_CLIENT_ORG}`);
      console.log(`      Role: agent (client)`);
    }

    // Step 3: Add adam@victorysync.com as admin
    console.log('\n3️⃣  Adding adam@victorysync.com as admin...');
    const { error: adminError } = await supabase
      .from('org_users')
      .upsert({
        user_id: TEST_ADMIN_UUID,
        org_id: VICTORYSYNC_ORG,
        role: 'org_admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,org_id' });
    
    if (adminError) {
      console.error('   ❌ Error:', adminError.message);
    } else {
      console.log('   ✅ Added/updated successfully');
      console.log(`      UUID: ${TEST_ADMIN_UUID}`);
      console.log(`      Email: adam@victorysync.com`);
      console.log(`      Org: ${VICTORYSYNC_ORG}`);
      console.log(`      Role: org_admin (admin)`);
    }

    // Step 4: Verify the setup
    console.log('\n4️⃣  Verifying setup...');
    const { data: verified } = await supabase
      .from('org_users')
      .select('user_id, org_id, role')
      .in('user_id', [TEST_CLIENT_UUID, TEST_ADMIN_UUID]);
    
    if (verified && verified.length === 2) {
      console.log('   ✅ Both users are now in org_users');
      verified.forEach(v => {
        const email = v.user_id === TEST_CLIENT_UUID ? 'test@test.com' : 'adam@victorysync.com';
        console.log(`      - ${email}: org ${v.org_id} (${v.role})`);
      });
    }

    // Step 5: Count recordings for each org
    console.log('\n5️⃣  Checking recordings availability...');
    
    const { count: clientRecordings } = await supabase
      .from('mightycall_recordings')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', TEST_CLIENT_ORG);
    
    const { count: adminRecordings } = await supabase
      .from('mightycall_recordings')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', VICTORYSYNC_ORG);
    
    console.log(`   Test Client Org (${TEST_CLIENT_ORG.substring(0, 8)}...): ${clientRecordings || 0} recordings`);
    console.log(`   VictorySync Org (${VICTORYSYNC_ORG.substring(0, 8)}...): ${adminRecordings || 0} recordings`);

    // Final instructions
    console.log('\n' + '='.repeat(70));
    console.log('✅ USER SETUP COMPLETE');
    console.log('='.repeat(70));
    console.log(`
Now you can test the API with:

1. CLIENT (test@test.com):
   User ID: ${TEST_CLIENT_UUID}
   Org ID: ${TEST_CLIENT_ORG}
   
   curl -H "x-user-id: ${TEST_CLIENT_UUID}" \\
        http://localhost:4000/api/recordings?org_id=${TEST_CLIENT_ORG}

2. ADMIN (adam@victorysync.com):
   User ID: ${TEST_ADMIN_UUID}
   Org ID: ${VICTORYSYNC_ORG}
   
   curl -H "x-user-id: ${TEST_ADMIN_UUID}" \\
        http://localhost:4000/api/recordings?org_id=${VICTORYSYNC_ORG}

⚠️  Important: The frontend still needs to be updated to use these UUIDs
   instead of email addresses for the x-user-id header.
    `);

    process.exit(0);
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

setupUsers();
