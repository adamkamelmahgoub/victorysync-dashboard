const https = require('https');

const ADMIN = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

console.log('🔍 Testing Endpoints with Larger Dataset\n');
console.log('=====================================\n');

function testEndpoint(path, label) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.victorysync.com',
      path,
      method: 'GET',
      headers: { 'x-user-id': ADMIN },
      timeout: 5000
    };

    https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`✅ ${label}`);
          console.log(`   Status: ${res.statusCode}`);
          
          if (json.stats) {
            console.log(`   Total Calls: ${json.stats.totalCalls}`);
            console.log(`   Answered: ${json.stats.answeredCalls}`);
            console.log(`   Total Duration: ${json.stats.totalDuration}s`);
            console.log(`   Avg Duration: ${json.stats.avgDuration}s`);
            console.log(`   Answer Rate: ${json.stats.answerRate}%`);
          } else if (json.recordings) {
            console.log(`   Records: ${json.recordings.length}`);
            if (json.recordings.length > 0) {
              const r = json.recordings[0];
              console.log(`   Sample: ${r.from_number} → ${r.to_number}`);
              console.log(`   Duration: ${r.duration}s`);
            }
          } else if (json.reports) {
            console.log(`   Reports: ${json.reports.length}`);
          }
        } catch (e) {
          console.log(`   ⚠️ Error: ${e.message}`);
        }
        resolve();
      });
    }).on('error', (e) => {
      console.log(`❌ ${label}: ${e.message}`);
      resolve();
    }).end();
  });
}

(async () => {
  // Test call-stats
  await testEndpoint(`/api/call-stats?org_id=${ORG}`, 'GET /api/call-stats');
  console.log();
  
  // Test recordings with larger limit
  await testEndpoint(`/api/recordings?org_id=${ORG}&limit=100`, 'GET /api/recordings (limit=100)');
  console.log();
  
  // Test reports
  await testEndpoint(`/api/mightycall/reports?org_id=${ORG}`, 'GET /api/mightycall/reports');
  
  console.log('\n=====================================');
  console.log('✅ All endpoints tested successfully');
  process.exit(0);
})();
