// scripts/smoke-test.js
/**
 * E2E Smoke Test for VictorySync Dashboard
 * Tests core user flows: signup, org creation, phone sync, role management.
 * Run with: node scripts/smoke-test.js
 */

const fetch = require('node-fetch');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';

let testResults = { pass: 0, fail: 0 };

async function test(name, fn) {
  try {
    console.log(`\n[TEST] ${name}`);
    await fn();
    console.log(`✓ PASS`);
    testResults.pass++;
  } catch (err) {
    console.log(`✗ FAIL: ${err.message}`);
    testResults.fail++;
  }
}

async function request(method, path, body = null, headers = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers }
  };
  if (body) opts.body = JSON.stringify(body);
  
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { }
  
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return json || text;
}

async function runSmokeTests() {
  console.log('\n========== VictorySync Smoke Tests ==========\n');

  // Test 1: Server health
  await test('Server is running', async () => {
    const res = await fetch(`${API_BASE_URL}/health`).catch(() => null);
    if (!res) throw new Error('Server not responding');
  });

  // Test 2: Create a test user (or use existing)
  let testUserId = 'test-user-' + Date.now();
  let testOrgId = null;
  
  await test('Create test organization', async () => {
    const body = {
      name: `Test Org ${Date.now()}`,
      sla_target_percent: 90,
      sla_target_seconds: 30
    };
    const result = await request('POST', '/api/admin/orgs', body, { 'x-user-id': testUserId });
    testOrgId = result.id || result.org_id;
    if (!testOrgId) throw new Error('No org ID returned');
  });

  // Test 3: Add user to org
  await test('Add user to organization', async () => {
    const body = { user_id: testUserId, role: 'org_admin' };
    await request('POST', `/api/admin/orgs/${testOrgId}/members`, body, { 'x-user-id': testUserId });
  });

  // Test 4: Fetch org list
  await test('Fetch user organizations', async () => {
    const result = await request('GET', '/api/user/orgs', null, { 'x-user-id': testUserId });
    if (!result.orgs) throw new Error('No orgs returned');
  });

  // Test 5: Fetch org profile
  await test('Fetch organization details', async () => {
    const result = await request('GET', `/api/admin/orgs/${testOrgId}`, null, { 'x-user-id': testUserId });
    if (!result.id && !result.org_id) throw new Error('No org details returned');
  });

  // Test 6: Test API key creation (org level)
  await test('Create org API key', async () => {
    const body = { label: 'smoke-test-key' };
    const result = await request('POST', `/api/orgs/${testOrgId}/api-keys`, body, { 'x-user-id': testUserId });
    if (!result.apiKey && !result.key) throw new Error('No API key returned');
  });

  // Test 7: Test MightyCall integration
  await test('Create MightyCall integration', async () => {
    const body = {
      integration_type: 'mightycall',
      label: 'Test MightyCall',
      credentials: { api_key: 'test-key', user_key: 'test-user-key', base_url: 'https://api.test.com' }
    };
    const result = await request('POST', `/api/admin/orgs/${testOrgId}/integrations`, body, { 'x-user-id': testUserId });
    if (!result.integration) throw new Error('No integration returned');
  });

  // Test 8: Fetch integrations
  await test('List org integrations', async () => {
    const result = await request('GET', `/api/admin/orgs/${testOrgId}/integrations`, null, { 'x-user-id': testUserId });
    if (!result.integrations) throw new Error('No integrations returned');
  });

  // Test 9: Test user profile endpoint
  await test('Fetch user profile', async () => {
    const result = await request('GET', '/api/user/profile', null, { 'x-user-id': testUserId });
    if (!result.profile && !result.user) throw new Error('No profile returned');
  });

  // Test 10: Test dashboard metrics
  await test('Fetch dashboard metrics', async () => {
    const result = await request('GET', `/api/client-metrics?org_id=${testOrgId}`, null, { 'x-user-id': testUserId });
    if (!result.metrics) throw new Error('No metrics returned');
  });

  console.log(`\n========== Results ==========`);
  console.log(`Passed: ${testResults.pass}`);
  console.log(`Failed: ${testResults.fail}`);
  console.log(`Total:  ${testResults.pass + testResults.fail}\n`);

  process.exit(testResults.fail > 0 ? 1 : 0);
}

runSmokeTests();
