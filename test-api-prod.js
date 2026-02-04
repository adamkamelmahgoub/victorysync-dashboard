const https = require('https');

function req(path, userId) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.victorysync.com',
      port: 443,
      path,
      method: 'GET',
      headers: {
        'x-user-id': userId,
        'Accept': 'application/json'
      },
      timeout: 10000
    };

    const r = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, body: parsed, raw: data });
      });
    });

    r.on('error', (e) => resolve({ status: null, error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: null, error: 'timeout' }); });
    r.end();
  });
}

async function testUser(userId, label, orgIds=[]) {
  console.log(`\n== Testing ${label} (${userId}) ==`);
  let res;

  res = await req('/health', userId);
  console.log('/health', res.status, typeof res.body === 'object' ? JSON.stringify(res.body) : String(res.body).slice(0,200));

  res = await req('/api/user/orgs', userId);
  console.log('/api/user/orgs', res.status, JSON.stringify(res.body).slice(0,400));

  res = await req('/api/user/profile', userId);
  console.log('/api/user/profile', res.status, JSON.stringify(res.body).slice(0,400));

  for (const orgId of orgIds) {
    // small sample
    res = await req(`/api/recordings?org_id=${orgId}&limit=3`, userId);
    console.log(`/api/recordings?org_id=${orgId}&limit=3`, res.status, typeof res.body === 'object' ? `recordings=${(res.body.recordings||[]).length}` : String(res.body).slice(0,200));
    // fetch more to verify pagination works
    res = await req(`/api/recordings?org_id=${orgId}&limit=2000`, userId);
    console.log(`/api/recordings?org_id=${orgId}&limit=2000`, res.status, typeof res.body === 'object' ? `recordings=${(res.body.recordings||[]).length}` : String(res.body).slice(0,200));
    // full fetch (default 10000)
    res = await req(`/api/recordings?org_id=${orgId}`, userId);
    console.log(`/api/recordings?org_id=${orgId} (no limit)`, res.status, typeof res.body === 'object' ? `recordings=${(res.body.recordings||[]).length}` : String(res.body).slice(0,200));
  }
}

(async () => {
  // Known test users/orgs from your workspace
  const testClientUser = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';
  const adminUser = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
  const testClientOrg = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
  const victoryOrg = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';

  await testUser(testClientUser, 'Test Client', [testClientOrg]);
  await testUser(adminUser, 'Admin', [victoryOrg, testClientOrg]);

  console.log('\nAll requests complete.');
})();
