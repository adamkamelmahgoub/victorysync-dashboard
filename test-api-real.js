#!/usr/bin/env node
const http = require('http');

const userId = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a'; // Real UUID from database
const orgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'; // Their org

const options = {
  hostname: 'localhost',
  port: 4000,
  path: `/api/recordings?org_id=${orgId}&limit=5`,
  method: 'GET',
  headers: {
    'x-user-id': userId,
    'Content-Type': 'application/json'
  }
};

console.log(`🧪 Testing API with real UUID:`);
console.log(`   User ID: ${userId}`);
console.log(`   Org ID: ${orgId}`);
console.log(`   Endpoint: http://localhost:4000/api/recordings?org_id=${orgId}&limit=5\n`);

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}\n`);
    
    try {
      const parsed = JSON.parse(data);
      console.log('✅ Response received:');
      console.log(JSON.stringify(parsed, null, 2).substring(0, 1500));
      
      if (parsed.length || parsed.length === 0) {
        console.log(`\n📊 Got ${parsed.length || 0} recordings`);
      }
      if (parsed.error) {
        console.log(`❌ Error: ${parsed.error}`);
        if (parsed.detail) console.log(`   Detail: ${parsed.detail}`);
      }
    } catch (e) {
      console.log('Raw response:');
      console.log(data.substring(0, 1000));
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Request failed: ${e.message}`);
});

req.end();
