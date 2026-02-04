const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTA1OTI3OTgsImV4cCI6MTcwNTIxMjc5OH0.dNBa0tFlDVhZNVgWWPWP3w8Fg8RN9v3tpNRPGcxYMfA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  try {
    console.log('=== Diagnostic Report ===\n');

    // 1. Check mightycall_recordings schema
    console.log('1. mightycall_recordings sample (first 3):');
    const { data: recordings, error: recErr } = await supabase
      .from('mightycall_recordings')
      .select('id, call_id, org_id, from_number, to_number, duration_seconds, recording_date')
      .limit(3);
    
    if (recErr) {
      console.error('Error:', recErr.message);
    } else {
      console.log(JSON.stringify(recordings, null, 2));
      console.log('');
    }

    // 2. Check for null phone numbers
    console.log('2. Recordings with null from_number or to_number:');
    const { data: nullPhones, error: nullErr } = await supabase
      .from('mightycall_recordings')
      .select('id, from_number, to_number')
      .or('from_number.is.null,to_number.is.null')
      .limit(5);
    
    if (nullErr) {
      console.error('Error:', nullErr.message);
    } else {
      console.log(`Found ${nullPhones?.length || 0} recordings with missing phone numbers`);
      if (nullPhones?.length) {
        console.log(JSON.stringify(nullPhones.slice(0, 3), null, 2));
      }
      console.log('');
    }

    // 3. Check calls table
    console.log('3. calls table sample (first 2):');
    const { data: calls, error: callErr } = await supabase
      .from('calls')
      .select('id, from_number, to_number, duration_seconds, started_at')
      .limit(2);
    
    if (callErr) {
      console.error('Error:', callErr.message);
    } else {
      console.log(JSON.stringify(calls, null, 2));
      console.log('');
    }

    // 4. Check org_users to find test users
    console.log('4. Sample org_users:');
    const { data: orgUsers, error: ouErr } = await supabase
      .from('org_users')
      .select('org_id, user_id, role')
      .limit(3);
    
    if (ouErr) {
      console.error('Error:', ouErr.message);
    } else {
      console.log(JSON.stringify(orgUsers, null, 2));
      if (orgUsers?.length) {
        const firstOrgId = orgUsers[0].org_id;
        const firstUserId = orgUsers[0].user_id;
        console.log(`\nTesting with org_id="${firstOrgId}" and user_id="${firstUserId}"`);
      }
      console.log('');
    }

    console.log('=== End Diagnostic ===');
  } catch (err) {
    console.error('Fatal error:', err);
  }

  process.exit(0);
}

diagnose();
