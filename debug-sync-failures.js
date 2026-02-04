/**
 * Debug Sync Endpoint Failures
 * Tests: Voicemail sync and call history sync with error details
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

async function debugSyncFailures() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         DEBUG: SYNC ENDPOINT FAILURES                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // TEST 1: Voicemail Sync - Default body
    console.log('TEST 1: Voicemail Sync (empty body)');
    console.log('─────────────────────────────────────────────────────────');
    const vm1 = await makeRequest(
      'POST',
      '/api/admin/mightycall/sync/voicemails',
      adminId,
      {}
    );
    console.log(`Status: ${vm1.status}`);
    console.log(`Response: ${JSON.stringify(vm1.parsed, null, 2)}`);
    console.log('');

    // TEST 2: Voicemail Sync - With date params
    console.log('TEST 2: Voicemail Sync (with date range)');
    console.log('─────────────────────────────────────────────────────────');
    const today = new Date().toISOString().split('T')[0];
    const week = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
    const vm2 = await makeRequest(
      'POST',
      '/api/admin/mightycall/sync/voicemails',
      adminId,
      { startDate: week, endDate: today }
    );
    console.log(`Status: ${vm2.status}`);
    console.log(`Response: ${JSON.stringify(vm2.parsed, null, 2)}`);
    console.log('');

    // TEST 3: Voicemail Sync - With org_id
    console.log('TEST 3: Voicemail Sync (with org_id)');
    console.log('─────────────────────────────────────────────────────────');
    const vm3 = await makeRequest(
      'POST',
      '/api/admin/mightycall/sync/voicemails',
      adminId,
      { org_id: testOrgId }
    );
    console.log(`Status: ${vm3.status}`);
    console.log(`Response: ${JSON.stringify(vm3.parsed, null, 2)}`);
    console.log('');

    // TEST 4: Call History Sync - Default body
    console.log('TEST 4: Call History Sync (empty body)');
    console.log('─────────────────────────────────────────────────────────');
    const calls1 = await makeRequest(
      'POST',
      '/api/admin/mightycall/sync/calls',
      adminId,
      {}
    );
    console.log(`Status: ${calls1.status}`);
    console.log(`Response: ${JSON.stringify(calls1.parsed, null, 2)}`);
    console.log('');

    // TEST 5: Call History Sync - With date params
    console.log('TEST 5: Call History Sync (with date range)');
    console.log('─────────────────────────────────────────────────────────');
    const calls2 = await makeRequest(
      'POST',
      '/api/admin/mightycall/sync/calls',
      adminId,
      { startDate: week, endDate: today }
    );
    console.log(`Status: ${calls2.status}`);
    console.log(`Response: ${JSON.stringify(calls2.parsed, null, 2)}`);
    console.log('');

    // TEST 6: Call History Sync - With org_id
    console.log('TEST 6: Call History Sync (with org_id)');
    console.log('─────────────────────────────────────────────────────────');
    const calls3 = await makeRequest(
      'POST',
      '/api/admin/mightycall/sync/calls',
      adminId,
      { org_id: testOrgId }
    );
    console.log(`Status: ${calls3.status}`);
    console.log(`Response: ${JSON.stringify(calls3.parsed, null, 2)}`);
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('DEBUG ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (vm1.status === 400) {
      console.log('⚠️  Voicemail sync expects parameters');
      if (vm2.status === 200) console.log('   ✓ Accepts startDate/endDate');
      if (vm3.status === 200) console.log('   ✓ Accepts org_id');
    }

    if (calls1.status === 400) {
      console.log('⚠️  Call history sync expects parameters');
      if (calls2.status === 200) console.log('   ✓ Accepts startDate/endDate');
      if (calls3.status === 200) console.log('   ✓ Accepts org_id');
    }

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}\n`);
  }
}

debugSyncFailures();
