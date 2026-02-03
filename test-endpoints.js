#!/usr/bin/env node

const http = require('http');

/**
 * Simple HTTP GET helper
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Testing endpoints after implementation...\n');
  
  const baseUrl = 'http://localhost:4000';
  const userId = 'a5f6f998-1234-5678-9abc-def012345678';
  const orgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
  
  try {
    console.log('1. Testing /api/recordings endpoint...');
    const recordingsUrl = `${baseUrl}/api/recordings?org_id=${orgId}&limit=5`;
    const recordingsRes = await httpGet(recordingsUrl);
    console.log('   Response:', JSON.stringify(recordingsRes, null, 2).substring(0, 500));
    
    console.log('\n2. Testing /api/sms/messages endpoint...');
    const smsUrl = `${baseUrl}/api/sms/messages?org_id=${orgId}&limit=5`;
    const smsRes = await httpGet(smsUrl);
    console.log('   Response:', JSON.stringify(smsRes, null, 2).substring(0, 500));
    
    console.log('\n✓ Both endpoints responded successfully!');
  } catch (err) {
    console.error('✗ Error:', err.message);
    console.error('\nMake sure the server is running on http://localhost:4000');
  }
}

main().catch(console.error);
