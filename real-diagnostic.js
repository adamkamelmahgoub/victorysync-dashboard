const http = require('http');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTA1OTI3OTgsImV4cCI6MTcwNTIxMjc5OH0.dNBa0tFlDVhZNVgWWPWP3w8Fg8RN9v3tpNRPGcxYMfA';
const supabase = createClient(supabaseUrl, supabaseKey);

const userId = 'test@test.com';

async function diagnose() {
  console.log(`\n=== REAL DIAGNOSTICS for ${userId} ===\n`);

  // 1. Check if user exists in org_users
  console.log('1. Checking org_users for test@test.com...');
  const { data: orgUsers, error: ouErr } = await supabase
    .from('org_users')
    .select('org_id, user_id, role')
    .eq('user_id', userId);
  
  if (ouErr) {
    console.error('Error querying org_users:', ouErr.message);
  } else {
    console.log(`Found ${orgUsers.length} org memberships:`);
    orgUsers.forEach(ou => console.log(`  - org_id: ${ou.org_id}, role: ${ou.role}`));
    
    if (orgUsers.length === 0) {
      console.log('⚠️ User is not a member of any org!');
      return;
    }
  }

  // 2. Check recordings in first org
  if (orgUsers && orgUsers.length > 0) {
    const testOrgId = orgUsers[0].org_id;
    console.log(`\n2. Checking recordings for org: ${testOrgId}...`);
    
    const { data: recordings, error: recErr } = await supabase
      .from('mightycall_recordings')
      .select('id, from_number, to_number, recording_url, recording_date')
      .eq('org_id', testOrgId)
      .limit(3);
    
    if (recErr) {
      console.error('Error querying recordings:', recErr.message);
    } else {
      console.log(`Found ${recordings.length} recordings in this org:`);
      recordings.forEach((rec, i) => {
        console.log(`  ${i+1}. ID: ${rec.id}`);
        console.log(`     From: ${rec.from_number} To: ${rec.to_number}`);
        console.log(`     URL: ${rec.recording_url ? 'YES' : 'NULL'}`);
      });
    }

    // 3. Now test the API
    console.log(`\n3. Testing API /api/recordings?org_id=${testOrgId}...`);
    
    const apiResponse = await new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 4000,
        path: `/api/recordings?org_id=${testOrgId}`,
        method: 'GET',
        headers: { 'x-user-id': userId }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, data: data });
          }
        });
      });
      
      req.on('error', (err) => {
        resolve({ error: err.message });
      });
      
      req.end();
    });

    console.log(`API Status: ${apiResponse.status || 'ERROR'}`);
    if (apiResponse.error) {
      console.log(`API Error: ${apiResponse.error}`);
    } else {
      if (apiResponse.data.error) {
        console.log(`API returned error: ${apiResponse.data.error}`);
        console.log(`Detail: ${apiResponse.data.detail}`);
      } else {
        console.log(`API returned ${apiResponse.data.recordings?.length || 0} recordings`);
        if (apiResponse.data.recordings && apiResponse.data.recordings.length > 0) {
          console.log(`First recording keys: ${Object.keys(apiResponse.data.recordings[0]).join(', ')}`);
        }
      }
    }
  }

  process.exit(0);
}

diagnose().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
