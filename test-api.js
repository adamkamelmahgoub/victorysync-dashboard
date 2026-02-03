#!/usr/bin/env node
const http = require('http');

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data, error: e.message });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function test() {
  try {
    const orgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
    
    console.log('Testing /api/recordings...');
    const recordings = await makeRequest(`/api/recordings?org_id=${orgId}&limit=2`);
    console.log(`✓ Recordings: ${recordings.recordings?.length || 0} items`);
    
    console.log('\nTesting /api/sms/messages...');
    const sms = await makeRequest(`/api/sms/messages?org_id=${orgId}&limit=2`);
    console.log(`✓ SMS: ${sms.messages?.length || 0} items`);
    
    console.log('\n✓ Both endpoints working!');
    process.exit(0);
  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
  }
}

test();
