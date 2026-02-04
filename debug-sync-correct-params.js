/**
 * Debug Sync Endpoint Failures - With correct parameter names
 */

const adminId = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const testOrgId = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

function makeRequest(method, path, userId, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      }
    };

    const req = require('http').request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data,
          parsed: tryParse(data)
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function tryParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

async function debugWithCorrectParams() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  DEBUG: SYNC WITH CORRECT PARAMETER NAMES (camelCase)    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // TEST 1: Voicemail Sync with orgId (camelCase)
    console.log('TEST 1: Voicemail Sync (orgId in body)');
    console.log('─────────────────────────────────────────────────────────');
    const vm1 = await makeRequest(
      'POST',
      '/api/admin/mightycall/sync/voicemails',
      adminId,
      { orgId: testOrgId }
    );
    console.log(`Status: ${vm1.status}`);
    console.log(`Response: ${JSON.stringify(vm1.parsed, null, 2)}`);
    console.log('');

    // TEST 2: Call History Sync with orgId (camelCase)
    console.log('TEST 2: Call History Sync (orgId in body)');
    console.log('─────────────────────────────────────────────────────────');
    const calls1 = await makeRequest(
      'POST',
      '/api/admin/mightycall/sync/calls',
      adminId,
      { orgId: testOrgId }
    );
    console.log(`Status: ${calls1.status}`);
    console.log(`Response: ${JSON.stringify(calls1.parsed, null, 2)}`);
    console.log('');

    // TEST 3: Call History Sync with date range
    console.log('TEST 3: Call History Sync (with dates)');
    console.log('─────────────────────────────────────────────────────────');
    const today = new Date().toISOString().split('T')[0];
    const week = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
    const calls2 = await makeRequest(
      'POST',
      '/api/admin/mightycall/sync/calls',
      adminId,
      { orgId: testOrgId, dateStart: week, dateEnd: today }
    );
    console.log(`Status: ${calls2.status}`);
    console.log(`Response: ${JSON.stringify(calls2.parsed, null, 2)}`);
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('RESULTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (vm1.status === 200) {
      console.log('✅ Voicemail sync WORKS with orgId parameter');
    } else {
      console.log(`❌ Voicemail sync failed with status ${vm1.status}`);
    }

    if (calls1.status === 200) {
      console.log('✅ Call history sync WORKS with orgId parameter');
    } else {
      console.log(`❌ Call history sync failed with status ${calls1.status}`);
    }

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}\n`);
  }
}

debugWithCorrectParams();
