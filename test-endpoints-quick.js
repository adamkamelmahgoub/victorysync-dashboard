const https = require('https');

const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
const ADMIN = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const CLIENT = '3b7c30f5-bda2-4c90-8be4-d0a1e4c4b5e8'; // A client user ID
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
          console.log(`\n[${res.statusCode}] ${label} - ${path}`);

          // Check response structure
          if (data.recordings) {
            console.log(`  📊 Recordings: ${data.recordings.length} items`);
            if (data.recordings.length > 0) {
              const rec = data.recordings[0];
              console.log(`  Fields: ${Object.keys(rec).join(', ')}`);
              console.log(`  Sample: id=${rec.id}, duration=${rec.duration}, date=${rec.recording_date || rec.created_at}`);
            }
          } else if (data.stats) {
            console.log(`  📊 Stats:`, data.stats);
          } else if (data.reports) {
            console.log(`  📊 Reports: ${data.reports.length} items`);
          } else if (data.messages) {
            console.log(`  📊 SMS: ${data.messages.length} items`);
          } else if (data.calls) {
            console.log(`  📊 Calls: ${data.calls.length} items`);
          } else if (Array.isArray(data)) {
            console.log(`  📊 Array: ${data.length} items`);
          } else {
            console.log(`  📊 Data:`, Object.keys(data).join(', '));
          }
        } catch (e) {
          console.log(`  ❌ Error parsing: ${e.message}`);
          console.log(`  Raw: ${body.slice(0, 200)}`);
        }
        resolve();
      });
    }).on('error', (err) => {
      console.log(`  ❌ Request failed: ${err.message}`);
      resolve();
    });
  });
}

async function runTests() {
  console.log('🔍 Testing Admin Access:');
  await test(`/api/call-stats?org_id=${ORG}`, ADMIN, 'ADMIN call-stats');
  await test(`/api/recordings?org_id=${ORG}&limit=3`, ADMIN, 'ADMIN recordings');
  await test(`/api/mightycall/reports?org_id=${ORG}&limit=3`, ADMIN, 'ADMIN reports');
  await test(`/api/call-history?org_id=${ORG}&limit=3`, ADMIN, 'ADMIN call-history');

  console.log('\n🔍 Testing Client Access:');
  await test(`/api/call-stats?org_id=${ORG}`, CLIENT, 'CLIENT call-stats');
  await test(`/api/recordings?org_id=${ORG}&limit=3`, CLIENT, 'CLIENT recordings');
  await test(`/api/mightycall/reports?org_id=${ORG}&limit=3`, CLIENT, 'CLIENT reports');

  process.exit(0);
}

runTests();
