#!/usr/bin/env node

/**
 * Verify that the VictorySync Dashboard fix is working correctly.
 * Tests:
 * 1. Backend API is responding
 * 2. Client config has correct API_BASE_URL
 * 3. Built client doesn't have hardcoded external API URL
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('\n=== VICTORYSYNC DASHBOARD FIX VERIFICATION ===\n');

// Test 1: Check client source config
console.log('[Test 1] Checking client config source...');
const configPath = path.join(__dirname, 'client/src/config.ts');
const configContent = fs.readFileSync(configPath, 'utf-8');
if (configContent.includes("export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''")) {
  console.log('✅ Client config defaults to empty string (same-origin)');
} else if (configContent.includes('API_BASE_URL')) {
  console.log('⚠️  Client config found but may not be correct');
  console.log('Content:', configContent.match(/API_BASE_URL[^\n]*/)?.[0] || 'Not found');
} else {
  console.log('❌ API_BASE_URL not found in config');
}

// Test 2: Check built client
console.log('\n[Test 2] Checking built client for hardcoded URLs...');
const distDir = path.join(__dirname, 'client/dist/assets');
if (!fs.existsSync(distDir)) {
  console.log('❌ dist/assets directory not found. Did you run npm run build?');
} else {
  const files = fs.readdirSync(distDir);
  const jsFile = files.find(f => f.match(/^index-.*\.js$/));
  if (!jsFile) {
    console.log('❌ No index-*.js file found in dist/assets');
  } else {
    const content = fs.readFileSync(path.join(distDir, jsFile), 'utf-8');
    if (content.includes('api.victorysync')) {
      console.log('❌ CRITICAL: Found api.victorysync in built client! Rebuild failed!');
    } else {
      console.log(`✅ No hardcoded victorysync URLs in built client (${jsFile})`);
    }
  }
}

// Test 3: Check backend
console.log('\n[Test 3] Testing backend API...');
const makeRequest = (path) => {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:4000${path}`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000);
  });
};

makeRequest('/api/client-metrics')
  .then(res => {
    if (res.status === 200 && res.data.metrics) {
      console.log('✅ Backend API responding correctly');
      console.log(`   Total calls: ${res.data.metrics.total_calls}`);
    } else {
      console.log(`⚠️  Backend returned status ${res.status}`);
    }
  })
  .catch(err => {
    console.log(`❌ Backend not responding: ${err.message}`);
    console.log('   Make sure the backend server is running on port 4000');
  })
  .then(() => {
    console.log('\n=== VERIFICATION COMPLETE ===\n');
    console.log('Next steps:');
    console.log('1. Make sure backend server is running: npm run dev (in server/ dir)');
    console.log('2. Serve the client: npx http-server client/dist -p 3000');
    console.log('3. Open http://localhost:3000 in your browser');
    console.log('4. Dashboard should now load with API calls to /api/... (not api.victorysync.com)');
    console.log('');
  });
