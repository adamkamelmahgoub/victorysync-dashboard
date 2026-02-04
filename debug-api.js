#!/usr/bin/env node
const http = require('http');

const CLIENT_UUID = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';
const CLIENT_ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

function makeRequest(path, userId) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: 'GET',
      headers: {
        'x-user-id': userId
      }
    };

    console.log(`\n🔗 Making request to: http://localhost:4000${path}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Headers: x-user-id=${userId}\n`);

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`📊 Status: ${res.statusCode}\n`);

        try {
          const json = JSON.parse(data);
          console.log('Response:');
          console.log(JSON.stringify(json, null, 2).substring(0, 1500));
          
          if (json.recordings) {
            console.log(`\n✅ Got ${json.recordings.length} recordings`);
          } else if (json.error) {
            console.log(`\n❌ Error: ${json.error}`);
            if (json.detail) console.log(`   Detail: ${json.detail}`);
          }
        } catch (e) {
          console.log('Raw response:');
          console.log(data.substring(0, 500));
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log(`❌ Error: ${err.message}`);
      resolve();
    });

    setTimeout(() => {
      console.log(`❌ Timeout after 5 seconds`);
      resolve();
    }, 5000);

    req.end();
  });
}

async function test() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║ Testing API with Real User Data                       ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  // Test 1: Basic health check
  console.log('\n1️⃣ Health Check:');
  await makeRequest('/health', CLIENT_UUID);

  // Test 2: Get recordings
  console.log('\n2️⃣ Get Recordings:');
  await makeRequest(`/api/recordings?org_id=${CLIENT_ORG}&limit=5`, CLIENT_UUID);

  // Test 3: Get user profile
  console.log('\n3️⃣ Get User Profile:');
  await makeRequest('/api/user/profile', CLIENT_UUID);

  // Test 4: Get user's orgs
  console.log('\n4️⃣ Get User Organizations:');
  await makeRequest('/api/user/orgs', CLIENT_UUID);

  console.log('\n' + '═'.repeat(60));
  console.log('Test complete!');
  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
