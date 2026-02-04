const http = require('http');

const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
const ADMIN = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const CLIENT = '3b7c30f5-bda2-4c90-8be4-d0a1e4c4b5e8';
const HOST = 'localhost:4000';

function test(path, userId, label) {
  return new Promise((resolve) => {
    const url = `http://${HOST}${path}`;
    const opts = {
      headers: { 'x-user-id': userId },
      timeout: 5000
    };

    http.get(url, opts, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log(`\n[${res.statusCode}] ${label} - ${path}`);

          if (data.recordings) {
            console.log(`  📊 Recordings: ${data.recordings.length} items`);
            if (data.recordings.length > 0) {
              const rec = data.recordings[0];
              console.log(`  Fields: ${Object.keys(rec).slice(0, 10).join(', ')}`);
              console.log(`  From: ${rec.from_number}, To: ${rec.to_number}, Duration: ${rec.duration}s, Date: ${rec.recording_date}`);
            }
          } else if (data.stats) {
            console.log(`  📊 Stats:`, data.stats);
          } else if (data.reports) {
            console.log(`  📊 Reports: ${data.reports.length} items`);
          } else if (Array.isArray(data)) {
            console.log(`  📊 Array: ${data.length} items`);
          } else {
            console.log(`  📊 Response:`, Object.keys(data).join(', '));
          }
        } catch (e) {
          console.log(`  ❌ Parse error: ${e.message}`);
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
  await test(`/api/recordings?org_id=${ORG}&limit=3`, ADMIN, 'ADMIN recordings');

  console.log('\n🔍 Testing Client Access:');
  await test(`/api/recordings?org_id=${ORG}&limit=3`, CLIENT, 'CLIENT recordings');

  process.exit(0);
}

runTests();
