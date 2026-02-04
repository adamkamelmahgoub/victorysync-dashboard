#!/usr/bin/env node
const http = require('http');

const userId = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const orgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';

const url = `http://localhost:4000/api/recordings?org_id=${orgId}&limit=5`;

console.log(`Testing: ${url}`);
console.log(`User ID: ${userId}\n`);

const req = http.get(url, {
  headers: {
    'x-user-id': userId
  }
}, (res) => {
  let data = '';
  
  res.on('data', chunk => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        console.log(`✅ Got ${parsed.length} recordings`);
        if (parsed.length > 0) {
          console.log(`\nFirst recording:`);
          console.log(JSON.stringify(parsed[0], null, 2).substring(0, 800));
        }
      } else if (parsed.error) {
        console.log(`❌ Error: ${parsed.error}`);
        console.log(JSON.stringify(parsed, null, 2));
      } else {
        console.log('Response:', JSON.stringify(parsed, null, 2).substring(0, 500));
      }
    } catch (e) {
      console.log('Raw response:', data.substring(0, 500));
    }
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error(`❌ Connection error: ${err.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ Request timeout after 5 seconds');
  process.exit(1);
}, 5000);
