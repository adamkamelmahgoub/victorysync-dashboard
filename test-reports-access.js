#!/usr/bin/env node

/**
 * Test script to verify reports visibility and data quality
 * Tests both admin and client access patterns
 */

const http = require('http');

async function testEndpoint(userId, orgId, path, description) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: 'GET',
      headers: {
        'x-user-id': userId,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            description,
            status: res.statusCode,
            data: parsed,
            success: res.statusCode === 200
          });
        } catch (e) {
          resolve({
            description,
            status: res.statusCode,
            data: data,
            success: false,
            error: e.message
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        description,
        status: 0,
        error: err.message,
        success: false
      });
    });

    req.end();
  });
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          TESTING REPORTS VISIBILITY TO CLIENTS             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const adminId = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';
  const testOrgId = 'org-test-client';

  // Test 1: Can admin see call stats?
  console.log('TEST 1: Admin Call Stats Access');
  const adminStats = await testEndpoint(
    adminId,
    testOrgId,
    `/api/call-stats?org_id=${testOrgId}&start_date=2024-01-01&end_date=2026-12-31`,
    'Admin call-stats'
  );
  console.log(`  Status: ${adminStats.status}`);
  if (adminStats.success) {
    const stats = adminStats.data.stats || {};
    console.log(`  ✅ Calls: ${stats.totalCalls}, Data points: ${stats.dataPoints}`);
  } else {
    console.log(`  ❌ Error: ${adminStats.error || adminStats.data?.error}`);
  }
  console.log('');

  // Test 2: Can admin see recordings?
  console.log('TEST 2: Admin Recordings Access');
  const adminRecs = await testEndpoint(
    adminId,
    testOrgId,
    `/api/recordings?org_id=${testOrgId}&limit=5`,
    'Admin recordings'
  );
  console.log(`  Status: ${adminRecs.status}`);
  if (adminRecs.success) {
    const recs = adminRecs.data.recordings || [];
    console.log(`  ✅ Got ${recs.length} recordings`);
    if (recs.length > 0) {
      const r = recs[0];
      console.log(`     Sample: ${r.display_name || r.from_number} → ${r.to_number} | Duration: ${r.duration}s`);
    }
  } else {
    console.log(`  ❌ Error: ${adminRecs.error || adminRecs.data?.error}`);
  }
  console.log('');

  // Test 3: Can admin see mightycall reports?
  console.log('TEST 3: Admin MightyCall Reports');
  const adminMCReports = await testEndpoint(
    adminId,
    testOrgId,
    `/api/mightycall/reports?type=calls&limit=10&org_id=${testOrgId}`,
    'Admin mightycall reports'
  );
  console.log(`  Status: ${adminMCReports.status}`);
  if (adminMCReports.success) {
    const reports = adminMCReports.data.reports || [];
    console.log(`  ✅ Got ${reports.length} reports`);
  } else {
    console.log(`  ❌ Error: ${adminMCReports.error || adminMCReports.data?.error}`);
  }
  console.log('');

  // Test 4: Check if there are any user-org relationships
  console.log('TEST 4: User Organization Memberships');
  const membersReq = new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: `/api/user/orgs`,
      method: 'GET',
      headers: {
        'x-user-id': adminId,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.end();
  });

  const userOrgs = await membersReq;
  if (userOrgs?.organizations) {
    console.log(`  ✅ User is member of ${userOrgs.organizations.length} org(s):`);
    userOrgs.organizations.forEach((org, i) => {
      console.log(`     ${i+1}. ${org.name} (${org.id})`);
    });
  } else {
    console.log(`  ❌ Could not fetch user organizations`);
  }
  console.log('');

  // Test 5: Check specific org membership
  console.log(`TEST 5: Checking Membership in ${testOrgId}`);
  const memberReq = new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: `/api/org/${testOrgId}`,
      method: 'GET',
      headers: {
        'x-user-id': adminId,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: null });
        }
      });
    });

    req.on('error', () => resolve({ status: 0, data: null }));
    req.end();
  });

  const memberResult = await memberReq;
  console.log(`  Status: ${memberResult.status}`);
  if (memberResult.status === 200) {
    console.log(`  ✅ User has access to org`);
    if (memberResult.data?.org) {
      console.log(`     Org: ${memberResult.data.org.name}`);
    }
  } else if (memberResult.status === 403) {
    console.log(`  ❌ User does NOT have access to this org (forbidden)`);
  } else {
    console.log(`  ❓ Unknown status`);
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                   TESTING COMPLETE                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

main();
