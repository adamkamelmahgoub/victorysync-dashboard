const https = require('https');

// Real user IDs from the system
const ADMIN = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a'; // platform_admin
const AGENT = 'b8cd2680-7c2e-4c1a-a9b3-f8e9c3d2b1a5'; // agent user
const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
const HOST = 'api.victorysync.com';

function test(path, userId, label) {
  return new Promise((resolve) => {
    const url = `https://${HOST}${path}`;
    const opts = {
      headers: { 'x-user-id': userId },
      timeout: 5000
    };

    https.get(url, opts, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log(`\n[${res.statusCode}] ${label}`);

          if (data.recordings) {
            console.log(`  Recordings: ${data.recordings.length} items`);
            if (data.recordings.length > 0) {
              const rec = data.recordings[0];
              console.log(`  Sample: from=${rec.from_number}, to=${rec.to_number}, duration=${rec.duration}s`);
            }
          } else if (data.stats) {
            console.log(`  Stats: answered=${data.stats.answeredCalls}/${data.stats.totalCalls}`);
          } else {
            console.log(`  Response keys:`, Object.keys(data).join(', '));
          }
        } catch (e) {
          console.log(`  Parse error: ${e.message}`);
        }
        resolve();
      });
    }).on('error', (err) => {
      console.log(`  Error: ${err.message}`);
      resolve();
    });
  });
}

async function runTests() {
  console.log('🔍 Testing with REAL users:\n');
  await test(`/api/recordings?org_id=${ORG}&limit=3`, ADMIN, 'ADMIN recordings');
  await test(`/api/call-stats?org_id=${ORG}`, ADMIN, 'ADMIN call-stats');
  
  console.log('\n--- Non-admin user (Agent) ---');
  await test(`/api/recordings?org_id=${ORG}&limit=3`, AGENT, 'AGENT recordings');
  await test(`/api/call-stats?org_id=${ORG}`, AGENT, 'AGENT call-stats');

  process.exit(0);
}

runTests();
