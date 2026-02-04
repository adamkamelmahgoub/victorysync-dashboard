/**
 * Setup test user and org for testing
 * Creates test org, test user, and membership
 */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTA1OTI3OTgsImV4cCI6MTcwNTIxMjc5OH0.dNBa0tFlDVhZNVgWWPWP3w8Fg8RN9v3tpNRPGcxYMfA';
const supabase = createClient(supabaseUrl, supabaseKey);

const userId = 'test@test.com';
const testOrgName = 'Test Organization';

async function setup() {
  console.log('\n=== Setting up test user and org ===\n');

  try {
    // 1. Check if org exists
    console.log('1. Checking for existing test org...');
    const { data: existingOrgs, error: orgCheckErr } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('name', testOrgName);
    
    let testOrgId;
    if (existingOrgs && existingOrgs.length > 0) {
      testOrgId = existingOrgs[0].id;
      console.log(`✓ Found existing org: ${testOrgId}`);
    } else {
      // Create org
      console.log('2. Creating test org...');
      const { data: newOrg, error: createOrgErr } = await supabase
        .from('organizations')
        .insert({ name: testOrgName })
        .select('id')
        .single();
      
      if (createOrgErr) throw createOrgErr;
      testOrgId = newOrg.id;
      console.log(`✓ Created org: ${testOrgId}`);
    }

    // 2. Check if user is already a member
    console.log('\n3. Checking if user is org member...');
    const { data: existingMembership, error: checkMemberErr } = await supabase
      .from('org_users')
      .select('id, role')
      .eq('user_id', userId)
      .eq('org_id', testOrgId)
      .maybeSingle();
    
    if (existingMembership) {
      console.log(`✓ User already member with role: ${existingMembership.role}`);
    } else {
      // Create membership
      console.log('4. Creating org membership...');
      const { error: createMemberErr } = await supabase
        .from('org_users')
        .insert({
          org_id: testOrgId,
          user_id: userId,
          role: 'org_admin',
          mightycall_extension: null
        });
      
      if (createMemberErr) throw createMemberErr;
      console.log('✓ Created membership');
    }

    // 3. Check recordings in this org
    console.log('\n5. Checking recordings in test org...');
    const { data: recordings, error: recErr } = await supabase
      .from('mightycall_recordings')
      .select('id, from_number, to_number, recording_url, recording_date, org_id')
      .limit(1);
    
    if (recErr) {
      console.log('⚠️ Error querying recordings:', recErr.message);
    } else if (recordings && recordings.length > 0) {
      console.log(`Found ${recordings.length} total recordings`);
      console.log(`Sample: ${JSON.stringify(recordings[0], null, 2).substring(0, 200)}...`);
      
      // Check if any recordings belong to test org
      const testOrgRecordings = await supabase
        .from('mightycall_recordings')
        .select('id, from_number, to_number')
        .eq('org_id', testOrgId)
        .limit(5);
      
      if (testOrgRecordings.error) {
        console.log('⚠️ Error checking test org recordings:', testOrgRecordings.error.message);
      } else {
        console.log(`Test org has ${testOrgRecordings.data.length} recordings`);
        if (testOrgRecordings.data.length === 0) {
          console.log('⚠️ Test org has no recordings! Need to assign some.');
        }
      }
    } else {
      console.log('⚠️ No recordings found in entire database!');
    }

    console.log('\n=== Setup Complete ===');
    console.log(`Use: org_id=${testOrgId}, user_id=${userId}`);
    console.log('\nTest API with: http://localhost:4000/api/recordings?org_id=' + testOrgId);
    console.log('Header: x-user-id: ' + userId);

  } catch (err) {
    console.error('\n✗ Setup failed:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

setup();
