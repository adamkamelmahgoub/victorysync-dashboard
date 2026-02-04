const http = require('http');

function testEndpoint(path, userId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: 'GET',
      headers: {
        'x-user-id': userId,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('Testing API endpoints...\n');
  
  const testUserId = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';
  
  try {
    // Test health endpoint
    console.log('1. Testing /health endpoint...');
    const health = await testEndpoint('/health', testUserId);
    console.log(`   Status: ${health.status}`);
    console.log(`   Response: ${health.body}\n`);
    
    // Test /api/user/orgs endpoint
    console.log('2. Testing /api/user/orgs endpoint...');
    const orgs = await testEndpoint('/api/user/orgs', testUserId);
    console.log(`   Status: ${orgs.status}`);
    console.log(`   Response: ${orgs.body}\n`);
    
    // Test /api/user/profile endpoint
    console.log('3. Testing /api/user/profile endpoint...');
    const profile = await testEndpoint('/api/user/profile', testUserId);
    console.log(`   Status: ${profile.status}`);
    console.log(`   Response: ${profile.body}\n`);
    
    // Test /api/recordings endpoint with org from orgs response
    if (orgs.status === 200) {
      try {
        const orgsData = JSON.parse(orgs.body);
        if (orgsData.orgs && orgsData.orgs.length > 0) {
          const orgId = orgsData.orgs[0].id;
          console.log(`4. Testing /api/recordings with org_id: ${orgId}...`);
          const recordings = await testEndpoint(`/api/recordings?org_id=${orgId}&limit=3`, testUserId);
          console.log(`   Status: ${recordings.status}`);
          const recordingsData = JSON.parse(recordings.body);
          console.log(`   Found ${recordingsData.recordings ? recordingsData.recordings.length : 0} recordings`);
          if (recordingsData.recordings && recordingsData.recordings.length > 0) {
            console.log(`   First recording ID: ${recordingsData.recordings[0].id}\n`);
          }
        }
      } catch (e) {
        console.log(`   Error parsing orgs response: ${e.message}\n`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

run();
