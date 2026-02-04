const https = require('https');

const testUser = {
  id: 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a'
};

const testOrgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';

async function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://localhost:4000${path}`);
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'x-user-id': testUser.id,
        'Content-Type': 'application/json'
      }
    };

    const req = require('http').request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('\n📊 TESTING DATA & SYNC STATUS\n');
  console.log(`User ID: ${testUser.id}`);
  console.log(`Org ID: ${testOrgId}\n`);

  try {
    // 1. Test Reports endpoint
    console.log('1️⃣  Checking Reports...');
    const reports = await makeRequest(`/api/mightycall/reports?org_id=${testOrgId}&limit=5`);
    console.log(`   Status: ${reports.status}`);
    console.log(`   Reports count: ${reports.data?.reports?.length || 0}`);
    if (reports.data?.reports?.length > 0) {
      console.log(`   Sample: ${JSON.stringify(reports.data.reports[0], null, 2).split('\n').slice(0, 5).join('\n')}`);
    }

    // 2. Test Recordings endpoint
    console.log('\n2️⃣  Checking Recordings...');
    const recordings = await makeRequest(`/api/mightycall/recordings?org_id=${testOrgId}&limit=5`);
    console.log(`   Status: ${recordings.status}`);
    console.log(`   Recordings count: ${recordings.data?.recordings?.length || 0}`);
    if (recordings.data?.recordings?.length > 0) {
      console.log(`   Sample: ${JSON.stringify(recordings.data.recordings[0], null, 2).split('\n').slice(0, 5).join('\n')}`);
    }

    // 3. Test SMS endpoint
    console.log('\n3️⃣  Checking SMS Messages...');
    const sms = await makeRequest(`/api/sms/messages?org_id=${testOrgId}&limit=5`);
    console.log(`   Status: ${sms.status}`);
    console.log(`   SMS count: ${sms.data?.messages?.length || 0}`);
    if (sms.data?.messages?.length > 0) {
      console.log(`   Sample: ${JSON.stringify(sms.data.messages[0], null, 2).split('\n').slice(0, 5).join('\n')}`);
    }

    // 4. Test Call Stats
    console.log('\n4️⃣  Checking Call Stats (KPIs)...');
    const stats = await makeRequest(`/api/call-stats?org_id=${testOrgId}`);
    console.log(`   Status: ${stats.status}`);
    console.log(`   Stats: ${JSON.stringify(stats.data?.stats || stats.data, null, 2)}`);

    // 5. Trigger sync manually
    console.log('\n5️⃣  Triggering Reports Sync...');
    const syncReports = await makeRequest(`/api/mightycall/sync/reports`, 'POST', {
      orgId: testOrgId,
      startDate: new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0]
    });
    console.log(`   Status: ${syncReports.status}`);
    console.log(`   Response: ${JSON.stringify(syncReports.data, null, 2)}`);

    // Wait a moment then check reports again
    console.log('\n⏳ Waiting 2 seconds for data to sync...');
    await new Promise(r => setTimeout(r, 2000));

    console.log('\n6️⃣  Checking Reports Again (Post-Sync)...');
    const reportsAfter = await makeRequest(`/api/mightycall/reports?org_id=${testOrgId}&limit=5`);
    console.log(`   Status: ${reportsAfter.status}`);
    console.log(`   Reports count: ${reportsAfter.data?.reports?.length || 0}`);

    console.log('\n✅ TEST COMPLETE\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

test();
