#!/usr/bin/env node
/**
 * VictorySync E2E Smoke Test
 * Verifies all major components work together
 */

const http = require('http');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env vars');
  process.exit(1);
}

let testsPassed = 0;
let testsFailed = 0;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'test-user-id',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, fn) {
  process.stdout.write(`Testing: ${name}... `);
  try {
    await fn();
    console.log('✅ PASS');
    testsPassed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('🚀 VictorySync E2E Smoke Tests\n');

  // Test server is responding
  await test('Server is responding', async () => {
    const res = await request('GET', '/api/health').catch(() => ({ status: 0 }));
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  // Test health endpoint (if it exists)
  await test('Health check endpoint', async () => {
    const res = await request('GET', '/health').catch(() => ({ status: 404 }));
    // 404 is OK if endpoint doesn't exist; just checking server responds
    if (res.status !== 404 && res.status !== 200) throw new Error(`Unexpected status ${res.status}`);
  });

  // Test user profile endpoint (will fail without auth but that's OK)
  await test('User profile endpoint exists', async () => {
    const res = await request('GET', '/api/user/profile');
    // Expecting 401 (unauthenticated) is fine for this smoke test
    if (res.status === 404) throw new Error('Endpoint does not exist');
  });

  // Test org integrations endpoint structure
  await test('Admin org integrations endpoint exists', async () => {
    const res = await request('GET', '/api/admin/orgs/test-org/integrations');
    // Expecting 401 or 403 is fine; endpoint should exist
    if (res.status === 404) throw new Error('Endpoint does not exist');
  });

  // Test MightyCall sync endpoints exist
  await test('MightyCall phone-numbers endpoint exists', async () => {
    const res = await request('GET', '/api/mightycall/phone-numbers');
    // Expecting 401 is fine
    if (res.status === 404) throw new Error('Endpoint does not exist');
  });

  await test('MightyCall reports endpoint exists', async () => {
    const res = await request('GET', '/api/mightycall/reports');
    if (res.status === 404) throw new Error('Endpoint does not exist');
  });

  await test('MightyCall recordings endpoint exists', async () => {
    const res = await request('GET', '/api/mightycall/recordings');
    if (res.status === 404) throw new Error('Endpoint does not exist');
  });

  await test('SMS messages endpoint exists', async () => {
    const res = await request('GET', '/api/sms/messages');
    if (res.status === 404) throw new Error('Endpoint does not exist');
  });

  await test('MightyCall sync jobs endpoint exists', async () => {
    const res = await request('GET', '/api/mightycall/sync/jobs');
    if (res.status === 404) throw new Error('Endpoint does not exist');
  });

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log('='.repeat(50));

  if (testsFailed > 0) {
    console.error('\n⚠️  Some tests failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ All smoke tests passed! Server is ready for testing.');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
