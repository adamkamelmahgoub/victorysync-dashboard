const http = require('http');

// Test 1: Get recordings without auth - should fail
console.log('\n=== Test 1: No auth ===');
http.get('http://localhost:4000/api/recordings?org_id=test-org', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
}).on('error', err => console.error('Error:', err.message));

// Test 2: Get recordings with test user ID
setTimeout(() => {
  console.log('\n=== Test 2: With user ID ===');
  const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/recordings?org_id=test-org',
    method: 'GET',
    headers: {
      'x-user-id': 'test-user',
      'x-supabase-auth-user-id': 'test-user'
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      try {
        const parsed = JSON.parse(data);
        console.log('Response:', JSON.stringify(parsed, null, 2).substring(0, 500));
        if (parsed.recordings) {
          console.log('Number of recordings:', parsed.recordings.length);
          if (parsed.recordings.length > 0) {
            console.log('First recording:', JSON.stringify(parsed.recordings[0], null, 2).substring(0, 300));
          }
        }
      } catch (e) {
        console.log('Raw response:', data.substring(0, 500));
      }
    });
  });

  req.on('error', err => console.error('Error:', err.message));
  req.end();
}, 500);

// Test 3: Check database directly
setTimeout(() => {
  console.log('\n=== Test 3: Check what orgs exist ===');
  console.log('(This would require database access)');
  process.exit(0);
}, 1000);
