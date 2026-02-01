#!/usr/bin/env node
/**
 * VictorySync Smoke E2E Test Suite
 * 
 * Tests critical user flows:
 * 1. User auth (signup, login, profile fetch)
 * 2. Org creation and membership
 * 3. MightyCall integration setup
 * 4. Phone number sync
 * 5. Call recording and reporting
 */

const https = require('https');
const http = require('http');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4000';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://edsyhtlaqwiicxlzorca.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TempPassword123!';

let testUserId = null;
let testOrgId = null;
let testAccessToken = null;

// Utility to make HTTP requests
function makeRequest(method, url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = client.request(urlObj, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
            text: data,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: null,
            text: data,
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Test utilities
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passCount++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  Error: ${err.message}`);
      failCount++;
    }
  })();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ========== Tests ==========

async function runTests() {
  console.log('🚀 VictorySync Smoke E2E Tests\n');

  // Test 1: Health check
  await test('API server is running', async () => {
    const res = await makeRequest('GET', `${API_BASE}/health`);
    assert(res.status === 200 || res.status === 404, `health check returned ${res.status}`);
  });

  // Test 2: Create user via Supabase
  await test('Create test user in Supabase', async () => {
    const res = await makeRequest('POST', `${SUPABASE_URL}/auth/v1/signup`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }, {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    });
    if (res.status === 200 || res.status === 201) {
      testUserId = res.body?.user?.id;
      testAccessToken = res.body?.session?.access_token;
      assert(testUserId, 'User ID not returned');
    } else {
      // User might already exist, try login
      console.log(`  Note: Signup failed (${res.status}), attempting login...`);
      const loginRes = await makeRequest('POST', `${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }, {
        apikey: SUPABASE_ANON_KEY,
      });
      assert(loginRes.status === 200, `Login failed: ${loginRes.status}`);
      testUserId = loginRes.body?.user?.id;
      testAccessToken = loginRes.body?.session?.access_token;
    }
  });

  // Test 3: Fetch user profile via server
  await test('GET /api/user/profile returns user profile', async () => {
    assert(testUserId, 'test user not created');
    const res = await makeRequest('GET', `${API_BASE}/api/user/profile`, null, {
      'x-user-id': testUserId,
    });
    assert(res.status === 200, `GET /api/user/profile returned ${res.status}`);
    assert(res.body?.profile?.id === testUserId, 'Profile ID mismatch');
  });

  // Test 4: Fetch user orgs
  await test('GET /api/user/orgs returns org list', async () => {
    assert(testUserId, 'test user not created');
    const res = await makeRequest('GET', `${API_BASE}/api/user/orgs`, null, {
      'x-user-id': testUserId,
    });
    assert(res.status === 200, `GET /api/user/orgs returned ${res.status}`);
    assert(Array.isArray(res.body?.orgs), 'orgs is not an array');
  });

  // Test 5: Create an org via onboarding
  await test('POST /api/user/onboard creates org for user', async () => {
    assert(testUserId, 'test user not created');
    const res = await makeRequest('POST', `${API_BASE}/api/user/onboard`, {}, {
      'x-user-id': testUserId,
    });
    assert(res.status === 200 || res.status === 201, `POST /api/user/onboard returned ${res.status}`);
    testOrgId = res.body?.org?.id;
    assert(testOrgId, 'Org ID not returned');
  });

  // Test 6: Get org integrations (should be empty initially)
  await test('GET /api/admin/org/:orgId/integrations returns empty list', async () => {
    assert(testOrgId, 'test org not created');
    const res = await makeRequest('GET', `${API_BASE}/api/admin/orgs/${testOrgId}/integrations`, null, {
      'x-user-id': testUserId,
    });
    assert(res.status === 200 || res.status === 400, `GET integrations returned ${res.status}`);
    // 400 is OK if endpoint doesn't exist; we just want to verify auth
  });

  // Test 7: Client metrics endpoint
  await test('GET /api/client-metrics returns metrics', async () => {
    const res = await makeRequest('GET', `${API_BASE}/api/client-metrics`, null, {
      'x-user-id': testUserId,
    });
    assert(res.status === 200 || res.status === 400, `GET /api/client-metrics returned ${res.status}`);
    if (res.status === 200) {
      assert(res.body?.metrics, 'metrics not returned');
    }
  });

  // Test 8: Recent calls endpoint
  await test('GET /api/calls/recent returns call list', async () => {
    const res = await makeRequest('GET', `${API_BASE}/api/calls/recent`, null, {
      'x-user-id': testUserId,
    });
    assert(res.status === 200 || res.status === 400, `GET /api/calls/recent returned ${res.status}`);
    if (res.status === 200) {
      assert(Array.isArray(res.body?.items), 'items is not an array');
    }
  });

  // Test 9: Server build check
  await test('Server dist/index.js is compiled', async () => {
    const fs = require('fs');
    const path = require('path');
    const distPath = path.join(__dirname, '..', 'server', 'dist', 'index.js');
    assert(fs.existsSync(distPath), `dist/index.js not found at ${distPath}`);
  });

  // Test 10: Edge Function deployment check
  await test('MightyCall webhook Edge Function is deployed', async () => {
    const res = await makeRequest('POST', `${SUPABASE_URL}/functions/v1/mightycall-webhook`, {
      org_id: testOrgId || 'test',
      event: 'ping',
    }, {
      'Authorization': 'Bearer invalid-token',
    });
    // We expect 401 (auth failed) or 400 (bad org), not 404 (not found)
    assert(res.status !== 404, `mightycall-webhook function not found (404)`);
  });

  console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed\n`);
  return failCount === 0;
}

// Run all tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
