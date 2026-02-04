const http = require('http');

const testUser = {
  id: 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a'
};
const testOrgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';

async function makeRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'x-user-id': testUser.id,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function test() {
  console.log(`\n\n✅ FRONTEND READINESS TEST\n`);
  console.log(`Testing with org: ${testOrgId}`);
  console.log(`User: ${testUser.id}\n`);

  // Check if Reports page will have data
  console.log('1️⃣  REPORTS PAGE DATA:');
  const stats = await makeRequest(`/api/call-stats?org_id=${testOrgId}`);
  console.log(`   Total Calls: ${stats.stats.totalCalls}`);
  console.log(`   Answered: ${stats.stats.answeredCalls}`);
  console.log(`   Missed: ${stats.stats.missedCalls}`);
  console.log(`   Answer Rate: ${stats.stats.answerRate.toFixed(1)}%`);
  console.log(`   Avg Handle Time: ${stats.stats.avgHandleTime.toFixed(1)} minutes`);
  console.log(`   Sample calls returned: ${stats.calls.length}`);
  if (stats.calls.length > 0) {
    const call = stats.calls[0];
    console.log(`   Sample call: ${call.from_number} → ${call.to_number}, ${call.duration_seconds}s`);
  }

  // Check Recordings page
  console.log('\n2️⃣  RECORDINGS PAGE DATA:');
  const recs = await makeRequest(`/api/mightycall/recordings?org_id=${testOrgId}&limit=5`);
  console.log(`   Total recordings available: ${recs.recordings ? recs.recordings.length : 0}`);
  if (recs.recordings && recs.recordings.length > 0) {
    const rec = recs.recordings[0];
    console.log(`   Sample: ${rec.from_number} → ${rec.to_number}`);
    console.log(`           Duration: ${rec.duration_seconds}s`);
    console.log(`           URL: ${rec.recording_url ? '✅ Has URL' : '❌ No URL'}`);
  }

  // Check SMS page
  console.log('\n3️⃣  SMS PAGE DATA:');
  const sms = await makeRequest(`/api/sms/messages?org_id=${testOrgId}&limit=5`);
  console.log(`   Total SMS available: ${sms.messages ? sms.messages.length : 0}`);
  if (sms.messages && sms.messages.length > 0) {
    const msg = sms.messages[0];
    console.log(`   Sample: ${msg.from_number} → ${msg.to_number}`);
    console.log(`           Body: "${(msg.body || '').substring(0, 30)}..."`);
  }

  console.log('\n✨ VERDICT:');
  if (stats.stats.totalCalls > 0 && recs.recordings && recs.recordings.length > 0 && sms.messages && sms.messages.length > 0) {
    console.log('   ✅ All three pages (Reports, Recordings, SMS) have data');
    console.log('   ✅ Frontend should display data correctly');
  } else {
    console.log('   ⚠️  Some pages missing data - check database');
  }
  console.log('\n');
}

test().catch(console.error);
