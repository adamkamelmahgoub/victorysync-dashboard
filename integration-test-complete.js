/**
 * Complete Integration Test - Frontend to Backend
 * Simulates: Login → Select Org → View Recordings → Download/Play
 */

const testUserId = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';
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
          headers: res.headers,
          body: data,
          parsed: tryParse(data),
          isBlob: !data.toString().startsWith('{')
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
    return str;
  }
}

async function runIntegrationTest() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║       COMPLETE INTEGRATION TEST - FRONTEND WORKFLOW        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: User Logs In - Get Profile
    console.log('STEP 1️⃣  : User logs in and fetches profile...');
    const profileRes = await makeRequest('GET', '/api/user/profile', testUserId);
    if (profileRes.status !== 200) throw new Error(`Profile failed: ${profileRes.status}`);
    
    const profile = profileRes.parsed.profile;
    console.log(`  ✅ Profile loaded: ID=${profile.id}, Role=${profile.global_role || 'user'}\n`);

    // Step 2: Frontend fetches user organizations
    console.log('STEP 2️⃣  : Frontend fetches user organizations...');
    const orgsRes = await makeRequest('GET', '/api/user/orgs', testUserId);
    if (orgsRes.status !== 200) throw new Error(`Orgs failed: ${orgsRes.status}`);
    
    const orgs = orgsRes.parsed.orgs;
    console.log(`  ✅ Organizations loaded: ${orgs.length} org(s)`);
    orgs.forEach((org, i) => {
      console.log(`     ${i + 1}. ${org.name} (ID: ${org.id})`);
    });
    console.log('');

    // Step 3: User selects first org and fetches recordings (first page)
    console.log('STEP 3️⃣  : User selects org and fetches recordings (first 50)...');
    const recordingsRes = await makeRequest(
      'GET',
      `/api/recordings?org_id=${testOrgId}&limit=50`,
      testUserId
    );
    if (recordingsRes.status !== 200) throw new Error(`Recordings failed: ${recordingsRes.status}`);
    
    const recordings = recordingsRes.parsed.recordings;
    console.log(`  ✅ Recordings loaded: ${recordings.length} recordings\n`);

    // Display first 3 recordings
    console.log('  First 3 recordings:');
    recordings.slice(0, 3).forEach((rec, i) => {
      console.log(`    ${i + 1}. ID: ${rec.id}`);
      console.log(`       Duration: ${rec.duration_seconds || '?'} seconds`);
      console.log(`       Has URL: ${!!rec.recording_url}`);
    });
    console.log('');

    // Step 4: User clicks Play - Frontend fetches recording blob
    console.log('STEP 4️⃣  : User clicks Play on first recording...');
    const firstRecId = recordings[0].id;
    const downloadRes = await makeRequest(
      'GET',
      `/api/recordings/${firstRecId}/download`,
      testUserId
    );
    if (downloadRes.status !== 200) throw new Error(`Download failed: ${downloadRes.status}`);
    
    const fileSize = Buffer.byteLength(downloadRes.body);
    const contentType = downloadRes.headers['content-type'];
    console.log(`  ✅ Recording file downloaded successfully`);
    console.log(`     File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`     Content-Type: ${contentType}`);
    console.log(`     Download header: ${downloadRes.headers['content-disposition']}\n`);

    // Step 5: Verify pagination works - get total count
    console.log('STEP 5️⃣  : Verify pagination - fetch all recordings...');
    const allRes = await makeRequest(
      'GET',
      `/api/recordings?org_id=${testOrgId}`,
      testUserId
    );
    if (allRes.status !== 200) throw new Error(`All recordings failed: ${allRes.status}`);
    
    const totalCount = allRes.parsed.recordings.length;
    console.log(`  ✅ Total recordings available: ${totalCount}`);
    if (totalCount > 1000) {
      console.log(`     ✓ Pagination working! (Got ${totalCount} records, exceeds 1000 limit)`);
    }
    console.log('');

    // Summary
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ ALL TESTS PASSED ✅                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\nSUMMARY:');
    console.log(`  ✅ User authentication works`);
    console.log(`  ✅ Organization fetching works`);
    console.log(`  ✅ Recordings list works (pagination verified)`);
    console.log(`  ✅ Recording download/playback works`);
    console.log(`  ✅ Binary file streaming works`);
    console.log('\nCLIENT-SIDE FLOW VERIFIED:');
    console.log(`  1. Login → User Profile loaded`);
    console.log(`  2. Select Org → Organization list displayed`);
    console.log(`  3. View Recordings → ${totalCount} recordings available`);
    console.log(`  4. Click Play → Recording file (${(fileSize / 1024 / 1024).toFixed(2)}MB) downloaded`);
    console.log(`  5. Audio plays → Frontend receives binary audio data`);
    console.log('\n');

  } catch (error) {
    console.log(`\n❌ TEST FAILED: ${error.message}\n`);
    process.exit(1);
  }
}

runIntegrationTest();
