/**
 * Comprehensive Test Suite - All Endpoints
 * Tests: User Profile, Orgs, Recordings, Download
 */

const https = require('https');

// Test credentials
const testUserId = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a'; // Test Client
const adminId = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a'; // Admin
const testOrgId = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf'; // Test Client org
const victoryOrgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'; // VictorySync org

// Test token for test@test.com
const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZWNlMThkZC04YTNjLTQ5NTAtOTdhNi1kN2VlYWJlMjZlNGEiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJlbWFpbF9jb25maXJtZWQiOnRydWUsImFwcCI6eyJyb2xlIjoidXNlciJ9LCJpc3MiOiJodHRwczpcXC9cXC9icGpwbXFmdmd3dWpzbXJjY2VubC5zdXBhYmFzZS5jbyIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJpYXQiOjE3MzI5Mjc5NzAsImV4cCI6MTczMjkzMTU3MH0.VjKYVxAkNCKYrIh2z5N8DhIbYo6l1HJKKJWKlhIUEzM';

const BASE_URL = 'http://localhost:4000';

function makeRequest(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'x-user-id': testUserId,
      ...headers
    };

    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: defaultHeaders
    };

    const req = require('http').request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers, isBlob: true });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('COMPREHENSIVE ENDPOINT TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test 1: User Profile (Test Client)
  console.log('TEST 1: /api/user/profile (Test Client)');
  try {
    const profile = await makeRequest('GET', '/api/user/profile');
    console.log(`  Status: ${profile.status}`);
    if (profile.data && profile.data.id) {
      console.log(`  User ID: ${profile.data.id}`);
      console.log(`  Email: ${profile.data.email}`);
      console.log(`  Role: ${profile.data.global_role || 'user'}`);
      console.log('  ✅ PASS\n');
    } else {
      console.log('  ❌ FAIL - No user data returned\n');
    }
  } catch (e) {
    console.log(`  ❌ ERROR: ${e.message}\n`);
  }

  // Test 2: User Organizations (Test Client)
  console.log('TEST 2: /api/user/orgs (Test Client)');
  try {
    const orgs = await makeRequest('GET', '/api/user/orgs');
    console.log(`  Status: ${orgs.status}`);
    if (Array.isArray(orgs.data)) {
      console.log(`  Organizations: ${orgs.data.length}`);
      orgs.data.forEach((org, i) => {
        console.log(`    ${i+1}. ${org.name} (${org.id})`);
      });
      console.log('  ✅ PASS\n');
    } else if (orgs.data && orgs.data.organizations) {
      console.log(`  Organizations: ${orgs.data.organizations.length}`);
      orgs.data.organizations.forEach((org, i) => {
        console.log(`    ${i+1}. ${org.name} (${org.id})`);
      });
      console.log('  ✅ PASS\n');
    } else {
      console.log('  ❌ FAIL\n');
    }
  } catch (e) {
    console.log(`  ❌ ERROR: ${e.message}\n`);
  }

  // Test 3: Recordings List (First 50)
  console.log('TEST 3: /api/recordings (Test Org, limit=50)');
  try {
    const recs = await makeRequest('GET', `/api/recordings?org_id=${testOrgId}&limit=50`);
    console.log(`  Status: ${recs.status}`);
    if (recs.data && recs.data.recordings) {
      console.log(`  Recordings returned: ${recs.data.recordings.length}`);
      if (recs.data.recordings.length > 0) {
        const first = recs.data.recordings[0];
        console.log(`  First recording ID: ${first.id}`);
        console.log(`  Has recording_url: ${!!first.recording_url}`);
        console.log('  ✅ PASS\n');
      }
    } else {
      console.log('  ❌ FAIL\n');
    }
  } catch (e) {
    console.log(`  ❌ ERROR: ${e.message}\n`);
  }

  // Test 4: Get Recording Count (no limit - should return 2690)
  console.log('TEST 4: /api/recordings (Test Org, no limit - count)');
  try {
    const recs = await makeRequest('GET', `/api/recordings?org_id=${testOrgId}`);
    console.log(`  Status: ${recs.status}`);
    if (recs.data && recs.data.recordings) {
      console.log(`  Total recordings: ${recs.data.recordings.length}`);
      console.log(`  Expected: ~2690`);
      if (recs.data.recordings.length > 2000) {
        console.log('  ✅ PASS\n');
      } else {
        console.log('  ⚠️  WARNING - Expected more recordings\n');
      }
    }
  } catch (e) {
    console.log(`  ❌ ERROR: ${e.message}\n`);
  }

  // Test 5: Recording Download
  console.log('TEST 5: /api/recordings/:id/download (streaming test)');
  try {
    // First get a recording ID
    const recs = await makeRequest('GET', `/api/recordings?org_id=${testOrgId}&limit=1`);
    if (recs.data && recs.data.recordings && recs.data.recordings.length > 0) {
      const recId = recs.data.recordings[0].id;
      console.log(`  Testing with ID: ${recId}`);

      const download = await makeRequest('GET', `/api/recordings/${recId}/download`);
      console.log(`  Status: ${download.status}`);
      console.log(`  Content-Type: ${download.headers['content-type']}`);
      console.log(`  Has Content-Disposition: ${!!download.headers['content-disposition']}`);
      
      if (download.status === 200 && download.isBlob) {
        const size = Buffer.byteLength(download.data);
        console.log(`  File size: ${size} bytes`);
        if (size > 100000) {
          console.log('  ✅ PASS\n');
        } else {
          console.log('  ⚠️  WARNING - File seems small\n');
        }
      } else {
        console.log(`  ❌ FAIL - Status ${download.status}\n`);
      }
    }
  } catch (e) {
    console.log(`  ❌ ERROR: ${e.message}\n`);
  }

  // Test 6: Admin Access (Multiple Orgs)
  console.log('TEST 6: /api/user/profile (Admin check)');
  try {
    const admin = await makeRequest('GET', '/api/user/profile', { 'x-user-id': adminId });
    console.log(`  Status: ${admin.status}`);
    if (admin.data) {
      console.log(`  Role: ${admin.data.global_role}`);
      if (admin.data.global_role === 'platform_admin') {
        console.log('  ✅ Admin detected\n');
      }
    }
  } catch (e) {
    console.log(`  ❌ ERROR: ${e.message}\n`);
  }

  // Test 7: Admin Orgs
  console.log('TEST 7: /api/user/orgs (Admin - multiple orgs)');
  try {
    const orgs = await makeRequest('GET', '/api/user/orgs', { 'x-user-id': adminId });
    console.log(`  Status: ${orgs.status}`);
    let orgCount = 0;
    if (Array.isArray(orgs.data)) {
      orgCount = orgs.data.length;
    } else if (orgs.data && orgs.data.organizations) {
      orgCount = orgs.data.organizations.length;
    }
    console.log(`  Organizations: ${orgCount}`);
    if (orgCount >= 2) {
      console.log('  ✅ PASS - Admin has multiple orgs\n');
    }
  } catch (e) {
    console.log(`  ❌ ERROR: ${e.message}\n`);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('TESTS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

runTests().catch(console.error);
