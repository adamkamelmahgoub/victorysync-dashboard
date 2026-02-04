/**
 * Admin User Test - Verify Multi-Org Access
 */

const adminId = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';

function makeRequest(method, path, userId) {
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
          parsed: tryParse(data)
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function tryParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

async function testAdmin() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('ADMIN USER TEST - MULTI-ORG ACCESS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Get admin profile
    console.log('ADMIN PROFILE:');
    const profile = await makeRequest('GET', '/api/user/profile', adminId);
    console.log(`  Status: ${profile.status}`);
    console.log(`  ID: ${profile.parsed.profile.id}`);
    console.log(`  Role: ${profile.parsed.profile.global_role}`);
    console.log('');

    // Get admin organizations
    console.log('ADMIN ORGANIZATIONS:');
    const orgs = await makeRequest('GET', '/api/user/orgs', adminId);
    console.log(`  Status: ${orgs.status}`);
    console.log(`  Total orgs: ${orgs.parsed.orgs.length}`);
    console.log('');

    if (orgs.parsed.orgs && orgs.parsed.orgs.length > 0) {
      orgs.parsed.orgs.forEach((org, i) => {
        console.log(`  ${i + 1}. ${org.name}`);
        console.log(`     ID: ${org.id}`);
        console.log('');
      });

      // Test getting recordings from first org
      const firstOrg = orgs.parsed.orgs[0];
      console.log(`ADMIN ACCESSING FIRST ORG: ${firstOrg.name}`);
      const recs = await makeRequest('GET', `/api/recordings?org_id=${firstOrg.id}&limit=5`, adminId);
      console.log(`  Status: ${recs.status}`);
      console.log(`  Recordings: ${recs.parsed.recordings ? recs.parsed.recordings.length : 0}`);
      console.log('');

      // Test recording download from first org
      if (recs.parsed.recordings && recs.parsed.recordings.length > 0) {
        const recId = recs.parsed.recordings[0].id;
        console.log(`ADMIN DOWNLOADING RECORDING: ${recId}`);
        const download = await makeRequest('GET', `/api/recordings/${recId}/download`, adminId);
        console.log(`  Status: ${download.status}`);
        if (download.status === 200) {
          console.log(`  ✅ Download successful`);
        } else {
          console.log(`  ❌ Download failed`);
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ ADMIN TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

testAdmin();
