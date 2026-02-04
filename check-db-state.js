#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function diagnoseDatabase() {
  console.log('🔍 Diagnosing database state...\n');

  try {
    // 1. Check organizations
    console.log('📊 Organizations in database:');
    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, created_at')
      .limit(10);
    
    if (orgError) {
      console.error('❌ Error fetching organizations:', orgError.message);
    } else {
      console.log(`✅ Found ${orgs.length} organizations`);
      orgs.forEach(org => {
        console.log(`  - ${org.id}: ${org.name}`);
      });
    }

    // 2. Check org_users for test@test.com
    console.log('\n👤 Checking org_users for test@test.com:');
    const { data: userOrgs, error: userError } = await supabase
      .from('org_users')
      .select('user_id, org_id, created_at')
      .eq('user_id', 'test@test.com');
    
    if (userError) {
      console.error('❌ Error fetching org_users:', userError.message);
    } else {
      if (userOrgs.length === 0) {
        console.log('❌ test@test.com NOT FOUND in org_users table');
        console.log('   This is the problem! User must be added to an organization.');
      } else {
        console.log(`✅ test@test.com found in ${userOrgs.length} organization(s):`);
        userOrgs.forEach(uo => {
          console.log(`  - org_id: ${uo.org_id}`);
        });
      }
    }

    // 3. Check sample org_users entries
    console.log('\n📋 Sample org_users entries (first 5):');
    const { data: sampleUsers, error: sampleError } = await supabase
      .from('org_users')
      .select('user_id, org_id')
      .limit(5);
    
    if (sampleError) {
      console.error('❌ Error fetching sample:', sampleError.message);
    } else {
      if (sampleUsers.length === 0) {
        console.log('❌ org_users table is EMPTY - no users in any orgs');
      } else {
        sampleUsers.forEach(u => {
          console.log(`  - ${u.user_id} → ${u.org_id}`);
        });
      }
    }

    // 4. Check recordings
    console.log('\n🎙️ Recordings in database:');
    const { data: recordings, error: recError } = await supabase
      .from('mightycall_recordings')
      .select('recording_id, org_id, phone_number, duration')
      .limit(5);
    
    if (recError) {
      console.error('❌ Error fetching recordings:', recError.message);
    } else {
      console.log(`✅ Total mightycall_recordings: ?`);
      if (recordings.length === 0) {
        console.log('❌ mightycall_recordings table is EMPTY');
      } else {
        console.log(`✅ Sample recordings (first 5 of many):`);
        recordings.forEach(rec => {
          console.log(`  - ID: ${rec.recording_id}, Org: ${rec.org_id}, Phone: ${rec.phone_number}, Duration: ${rec.duration}s`);
        });
      }
    }

    // 5. Get count of recordings
    console.log('\n📈 Recording counts:');
    const { count: recCount, error: countError } = await supabase
      .from('mightycall_recordings')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Error counting recordings:', countError.message);
    } else {
      console.log(`✅ Total mightycall_recordings: ${recCount}`);
    }

    // 6. If test user has org, check recordings for that org
    if (userOrgs && userOrgs.length > 0) {
      const testOrgId = userOrgs[0].org_id;
      console.log(`\n🎙️ Recordings for test user's org (${testOrgId}):`);
      const { data: orgRecordings, error: orgRecError } = await supabase
        .from('mightycall_recordings')
        .select('*')
        .eq('org_id', testOrgId)
        .limit(3);
      
      if (orgRecError) {
        console.error('❌ Error:', orgRecError.message);
      } else {
        console.log(`✅ Found ${orgRecordings.length} recordings for this org`);
        orgRecordings.forEach(rec => {
          console.log(`  - ${rec.recording_id}: ${rec.phone_number} (${rec.duration}s)`);
        });
      }
    }

  } catch (error) {
    console.error('💥 Fatal error:', error.message);
  }

  console.log('\n✅ Diagnostic complete');
  process.exit(0);
}

diagnoseDatabase();
