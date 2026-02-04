#!/usr/bin/env node
const http = require('http');

const userId = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const orgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';

const url = `http://localhost:4000/api/recordings?org_id=${orgId}&limit=2`;

console.log('Making HTTP request...');
console.log(`URL: ${url}`);
console.log(`Headers: x-user-id=${userId}\n`);

const req = http.get(url, {
  headers: {
    'x-user-id': userId
  }
}, (res) => {
  console.log(`Status: ${res.statusCode}`);
  
  let data = '';
  res.on('data', chunk => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response received');
    try {
      const parsed = JSON.parse(data);
      console.log(`Parsed as JSON`);
      if (Array.isArray(parsed)) {
        console.log(`✅ Got array with ${parsed.length} items`);
        if (parsed.length > 0) {
          console.log('\nFirst item:');
          console.log(JSON.stringify(parsed[0], null, 2).substring(0, 600));
        }
      } else {
        console.log('Got object:', Object.keys(parsed).join(', '));
        console.log(JSON.stringify(parsed, null, 2).substring(0, 400));
      }
    } catch (e) {
      console.log('Failed to parse JSON');
      console.log('Raw response:', data.substring(0, 400));
    }
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error(`Error: ${err.message}`);
  console.log(`Make sure server is running on port 4000`);
  process.exit(1);
});

// Timeout after 3 seconds
setTimeout(() => {
  console.error('Timeout: no response after 3 seconds');
  process.exit(1);
}, 3000);
