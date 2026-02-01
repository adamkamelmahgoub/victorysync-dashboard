#!/usr/bin/env node

const http = require('http');

const tests = [
  { name: 'Phone Numbers', path: '/api/admin/mightycall/phone-numbers', method: 'GET' },
  { name: 'Sync', path: '/api/admin/mightycall/sync', method: 'POST' },
  { name: 'Invoices', path: '/api/admin/invoices', method: 'GET' },
  { name: 'Billing Plans', path: '/api/admin/billing-plans', method: 'GET' },
  { name: 'Support Tickets', path: '/api/admin/support-tickets', method: 'GET' },
  { name: 'Reports', path: '/api/admin/reports', method: 'GET' }
];

const headers = { 'x-user-id': '5a055f52-9ff8-49d3-9583-9903d5350c3e' };

async function testEndpoint(test) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path: test.path,
      method: test.method,
      headers,
      timeout: 3000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const result = { endpoint: test.name, status: res.statusCode };
        try {
          const json = JSON.parse(data);
          result.error = json.error;
          result.detail = json.detail;
        } catch (e) {
          result.body = data.substring(0, 100);
        }
        resolve(result);
      });
    });
    req.on('error', (err) => {
      resolve({ endpoint: test.name, status: 0, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ endpoint: test.name, status: 0, error: 'timeout' });
    });
    if (test.method === 'POST') {
      req.write('{}');
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n=== API ENDPOINT DIAGNOSTIC ===\n');
  for (const test of tests) {
    const result = await testEndpoint(test);
    const status = result.status === 200 ? '✅' : '❌';
    console.log(`${status} ${result.endpoint.padEnd(20)} [${result.status}]`);
    if (result.error) console.log(`   Error: ${result.error}`);
    if (result.detail) console.log(`   Detail: ${result.detail}`);
  }
  process.exit(0);
}

runTests();
