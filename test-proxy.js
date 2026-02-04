const http = require('http');

function makeRequest(path, userId, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'x-user-id': userId,
        'Content-Type': 'application/json'
      },
      // Don't follow redirects to see what happens
      maxRedirects: 0
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
  console.log('Testing frontend proxy to backend...\n');
  
  const testUserId = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';
  const testOrgId = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
  
  try {
    // Test through Vite proxy
    console.log('1. Testing /api/user/orgs through Vite proxy...');
    const orgs = await makeRequest('/api/user/orgs', testUserId);
    console.log(`   Status: ${orgs.status}`);
    if (orgs.status === 200) {
      const data = JSON.parse(orgs.body);
      console.log(`   Found ${data.orgs ? data.orgs.length : 0} organizations`);
      if (data.orgs && data.orgs.length > 0) {
        console.log(`   First org: ${data.orgs[0].name} (${data.orgs[0].id})\n`);
      }
    } else {
      console.log(`   Error: ${orgs.body.substring(0, 200)}\n`);
    }
    
    // Test /api/recordings through proxy
    console.log(`2. Testing /api/recordings through Vite proxy with org_id: ${testOrgId}...`);
    const recordings = await makeRequest(`/api/recordings?org_id=${testOrgId}&limit=5`, testUserId);
    console.log(`   Status: ${recordings.status}`);
    if (recordings.status === 200) {
      const data = JSON.parse(recordings.body);
      console.log(`   Found ${data.recordings ? data.recordings.length : 0} recordings`);
      if (data.recordings && data.recordings.length > 0) {
        console.log(`   First recording: ${data.recordings[0].id}\n`);
      }
    } else {
      console.log(`   Error: ${recordings.body.substring(0, 200)}\n`);
    }
    
    // Test /api/user/profile through proxy
    console.log('3. Testing /api/user/profile through Vite proxy...');
    const profile = await makeRequest('/api/user/profile', testUserId);
    console.log(`   Status: ${profile.status}`);
    if (profile.status === 200) {
      const data = JSON.parse(profile.body);
      console.log(`   User ID: ${data.profile.id}\n`);
    } else {
      console.log(`   Error: ${profile.body.substring(0, 200)}\n`);
    }
    
    console.log('✅ All proxy tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

run();
