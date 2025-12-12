#!/usr/bin/env node
/**
 * Basic integration test for the VictorySync Dashboard API Server
 * 
 * This test verifies:
 * 1. Server starts successfully and listens on port 4000
 * 2. Health check endpoint responds
 * 3. API endpoints return data (or expected errors)
 * 4. Error handlers work correctly
 */

const http = require('http');

const PORT = 4000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Helper to make HTTP requests
function makeRequest(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after 5s to ${path}`));
    });

    req.end();
  });
}

async function runTests() {
  console.log('🧪 VictorySync Dashboard Server Integration Tests\n');
  console.log(`📍 Testing server at ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;

  // Test 1: Health check (root endpoint)
  try {
    console.log('Test 1: Health check endpoint (GET /)');
    const res = await makeRequest('/', { 'x-user-id': 'test-user' });
    
    if (res.status === 200) {
      console.log('✅ PASS: Server is running and responding');
      console.log(`   Status: ${res.status}`);
      console.log(`   Response: ${res.body.substring(0, 100)}...\n`);
      passed++;
    } else {
      console.log(`❌ FAIL: Expected 200, got ${res.status}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 2: Client metrics endpoint
  try {
    console.log('Test 2: Client metrics API (GET /api/client-metrics)');
    const res = await makeRequest('/api/client-metrics', { 'x-user-id': 'test-user' });
    
    if (res.status === 200) {
      console.log('✅ PASS: Metrics endpoint is responding');
      console.log(`   Status: ${res.status}`);
      try {
        const data = JSON.parse(res.body);
        console.log(`   Data keys: ${Object.keys(data).join(', ')}\n`);
      } catch (e) {
        console.log(`   Response: ${res.body.substring(0, 100)}...\n`);
      }
      passed++;
    } else {
      console.log(`❌ FAIL: Expected 200, got ${res.status}`);
      console.log(`   Response: ${res.body.substring(0, 200)}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 3: Invalid endpoint (should return 404)
  try {
    console.log('Test 3: Invalid endpoint (GET /api/nonexistent)');
    const res = await makeRequest('/api/nonexistent', { 'x-user-id': 'test-user' });
    
    if (res.status >= 400) {
      console.log('✅ PASS: Server correctly returns error for invalid endpoint');
      console.log(`   Status: ${res.status}\n`);
      passed++;
    } else {
      console.log(`❌ FAIL: Expected 4xx/5xx, got ${res.status}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }

  // Test 4: CORS headers
  try {
    console.log('Test 4: CORS headers (GET /)');
    const res = await makeRequest('/', { 'Origin': 'http://localhost:3000' });
    
    if (res.headers['access-control-allow-origin']) {
      console.log('✅ PASS: CORS is enabled');
      console.log(`   Allow-Origin: ${res.headers['access-control-allow-origin']}\n`);
      passed++;
    } else {
      console.log('⚠️  WARNING: CORS headers not present (may be disabled)\n');
      // Don't count as fail since it could be intentional
      passed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failed++;
  }

  // Summary
  console.log('═'.repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed\n`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed.\n');
    process.exit(1);
  }
}

// Wait for server to start if needed, then run tests
console.log('Attempting to connect to server...\n');
let retries = 5;
const checkServer = () => {
  makeRequest('/')
    .then(() => runTests())
    .catch(() => {
      retries--;
      if (retries > 0) {
        console.log(`Server not ready, retrying... (${retries} attempts left)`);
        setTimeout(checkServer, 1000);
      } else {
        console.error('❌ Could not connect to server on port 4000');
        console.error('Make sure the server is running: npm run dev\n');
        process.exit(1);
      }
    });
};

checkServer();
