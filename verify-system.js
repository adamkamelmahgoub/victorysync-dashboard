#!/usr/bin/env node

/**
 * VictorySync Dashboard - System Status Checker
 * Verifies all endpoints are working and database tables exist
 */

const http = require('http');

const platformAdminId = '5a055f52-9ff8-49d3-9583-9903d5350c3e';
const endpoints = [
  { method: 'GET', path: '/api/admin/phone-numbers', name: 'Phone Numbers', description: 'Phone numbers synced from MightyCall' },
  { method: 'GET', path: '/api/admin/mightycall/sync', name: 'MightyCall Sync', description: 'Sync phone numbers from MightyCall' },
  { method: 'GET', path: '/api/admin/support-tickets', name: 'Support Tickets', description: 'Customer support tickets' },
  { method: 'GET', path: '/api/admin/reports', name: 'Reports', description: 'MightyCall reports and statistics' },
  { method: 'GET', path: '/api/admin/call-reports', name: 'Call Reports', description: 'Call history and analytics' },
  { method: 'GET', path: '/api/admin/invoices', name: 'Invoices', description: 'Billing invoices' },
  { method: 'GET', path: '/api/admin/billing-plans', name: 'Billing Plans', description: 'Available billing plans' },
  { method: 'GET', path: '/api/admin/packages', name: 'Packages', description: 'Billing packages' },
];

const testEndpoint = (method, path) => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'x-user-id': platformAdminId,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, path, method, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, path, method, data: {} });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ status: 'CONN_ERROR', path, method, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'TIMEOUT', path, method, error: 'Request timeout' });
    });

    req.end();
  });
};

const runTests = async () => {
  console.log('\n' + '='.repeat(70));
  console.log('  VictorySync Dashboard - System Status Check');
  console.log('='.repeat(70) + '\n');

  console.log('🔍 Testing API Server on http://localhost:4000\n');

  let successCount = 0;
  let failCount = 0;
  const results = [];

  for (const endpoint of endpoints) {
    process.stdout.write(`   Testing ${endpoint.name.padEnd(18)} ... `);
    const result = await testEndpoint(endpoint.method, endpoint.path);
    results.push(result);

    if (result.status === 200) {
      console.log('✅ [200 OK]');
      successCount++;
    } else if (result.status === 'CONN_ERROR') {
      console.log(`❌ [CONNECTION ERROR]`);
      console.log(`      Error: ${result.error}`);
      failCount++;
    } else if (result.status === 'TIMEOUT') {
      console.log(`❌ [TIMEOUT]`);
      failCount++;
    } else {
      console.log(`❌ [${result.status}]`);
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ${successCount} passed, ${failCount} failed\n`);

  if (failCount === 0 && successCount === endpoints.length) {
    console.log('✅ ALL ENDPOINTS WORKING!');
    console.log('\n🎉 Your VictorySync Dashboard is fully operational!\n');
    console.log('Next steps:');
    console.log('  1. Open http://localhost:3000 in your browser');
    console.log('  2. Log in with your credentials');
    console.log('  3. Test the features (sync, reports, invoices, etc.)\n');
  } else if (results.some(r => r.status === 'CONN_ERROR')) {
    console.log('⚠️  CANNOT CONNECT TO API SERVER');
    console.log('\nMake sure the API server is running:');
    console.log('  cd server');
    console.log('  npm run build');
    console.log('  node dist/index.js\n');
  } else {
    console.log('⚠️  SOME ENDPOINTS FAILED');
    console.log('\nTo debug:');
    console.log('  1. Check that all database tables exist in Supabase');
    console.log('  2. Verify .env file has correct credentials');
    console.log('  3. Check server logs for errors\n');
  }

  console.log('='.repeat(70) + '\n');

  // Show sample data from first successful endpoint
  const successResult = results.find(r => r.status === 200);
  if (successResult) {
    console.log('📝 Sample Response Data:\n');
    console.log(`   Endpoint: ${successResult.method} ${successResult.path}`);
    console.log(`   Response: ${JSON.stringify(successResult.data, null, 2).split('\n').map((line, i) => i === 0 ? line : '   ' + line).join('\n')}\n`);
  }

  process.exit(failCount > 0 ? 1 : 0);
};

// Show banner
console.log('');
console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║                   VictorySync Dashboard                            ║');
console.log('║                    System Status Checker v1.0                      ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
