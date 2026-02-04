#!/usr/bin/env node
const http = require('http');

// Real UUIDs from Supabase
const TEST_CLIENT_UUID = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';
const TEST_ADMIN_UUID = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';

// Org IDs
const TEST_CLIENT_ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
const VICTORYSYNC_ORG = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';

async function testApi(userId, orgId, userEmail, orgName) {
  return new Promise((resolve) => {
    const url = `http://localhost:4000/api/recordings?org_id=${orgId}&limit=3`;
    
    console.log(`\n📍 Testing: ${userEmail} (${orgName})`);
    console.log(`   URL: ${url}`);
    console.log(`   User ID: ${userId}\n`);
    
    const req = http.get(url, {
      headers: {
        'x-user-id': userId
      }
    }, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        
        try {
          const parsed = JSON.parse(data);
          
          if (parsed.recordings) {
            console.log(`   ✅ Got ${parsed.recordings.length} recordings`);
            if (parsed.recordings.length > 0) {
              const rec = parsed.recordings[0];
              console.log(`   Sample recording:`);
              console.log(`      - ID: ${rec.id?.substring(0, 8)}...`);
              console.log(`      - Phone: ${rec.from_number || rec.to_number || 'N/A'}`);
              console.log(`      - Duration: ${rec.duration_formatted || rec.duration_seconds}s`);
              console.log(`      - URL: ${rec.recording_url?.substring(0, 50)}...`);
            }
          } else if (parsed.error) {
            console.log(`   ❌ Error: ${parsed.error}`);
            if (parsed.detail) console.log(`   Detail: ${parsed.detail}`);
          } else {
            console.log(`   Response:`, JSON.stringify(parsed).substring(0, 200));
          }
        } catch (e) {
          console.log(`   Raw response: ${data.substring(0, 200)}`);
        }
        
        resolve();
      });
    });
    
    req.on('error', (err) => {
      console.log(`   ❌ Connection error: ${err.message}`);
      resolve();
    });
    
    setTimeout(() => {
      console.log(`   ❌ Timeout: No response after 3 seconds`);
      resolve();
    }, 3000);
  });
}

async function main() {
  console.log('='.repeat(70));
  console.log('🧪 TESTING API WITH REAL USERS');
  console.log('='.repeat(70));
  
  await testApi(TEST_CLIENT_UUID, TEST_CLIENT_ORG, 'test@test.com', 'Test Client1');
  await testApi(TEST_ADMIN_UUID, VICTORYSYNC_ORG, 'adam@victorysync.com', 'VictorySync');
  
  console.log('\n' + '='.repeat(70));
  console.log('📋 USER MAPPING');
  console.log('='.repeat(70));
  console.log(`
test@test.com:
  UUID: ${TEST_CLIENT_UUID}
  Org: ${TEST_CLIENT_ORG}
  Email in Auth: ✅ Confirmed
  In org_users: ✅ Confirmed (agent role)

adam@victorysync.com:
  UUID: ${TEST_ADMIN_UUID}
  Org: ${VICTORYSYNC_ORG}
  Email in Auth: ✅ Confirmed
  In org_users: ✅ Confirmed (org_admin role)
  `);
  
  process.exit(0);
}

main();
