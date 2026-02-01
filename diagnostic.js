const http = require('http');

const platformAdminId = '5a055f52-9ff8-49d3-9583-9903d5350c3e';
const orgId = '19b4c8f0-5a84-4d46-a4ce-d68bd58c0d47';

const endpoints = [
  { method: 'GET', path: '/api/admin/phone-numbers', name: 'Phone Numbers' },
  { method: 'GET', path: '/api/admin/mightycall/sync', name: 'Sync' },
  { method: 'GET', path: '/api/admin/invoices', name: 'Invoices' },
  { method: 'GET', path: '/api/admin/billing-plans', name: 'Billing Plans' },
  { method: 'GET', path: '/api/admin/support-tickets', name: 'Support Tickets' },
  { method: 'GET', path: '/api/admin/reports', name: 'Reports' },
  { method: 'GET', path: '/api/admin/call-reports', name: 'Call Reports' },
  { method: 'GET', path: '/api/admin/packages', name: 'Packages' }
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
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, path, method, data });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 'ERROR', path, method, error: err.message });
    });

    req.end();
  });
};

const runTests = async () => {
  console.log('🔍 Testing API Endpoints...\n');
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.method, endpoint.path);
    const status = result.status === 200 ? '✅' : '❌';
    console.log(`${status} ${endpoint.name.padEnd(20)} [${result.status}] ${endpoint.method} ${endpoint.path}`);
    
    if (result.status !== 200 && result.data) {
      try {
        const parsed = JSON.parse(result.data);
        if (parsed.message || parsed.error) {
          console.log(`   └─ ${parsed.message || parsed.error}`);
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
  }
};

runTests();
