/**
 * Debug Profile/Orgs Endpoints
 */

const testUserId = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';
const adminId = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';

function makeRequest(method, path, userId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      }
    };

    const req = require('http').request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ 
          status: res.statusCode, 
          body: data,
          parsed: tryParse(data),
          contentType: res.headers['content-type']
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function tryParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

async function test() {
  console.log('\n=== TESTING PROFILE ENDPOINTS ===\n');

  console.log('TEST: /api/user/profile (Test Client)');
  const profile = await makeRequest('GET', '/api/user/profile', testUserId);
  console.log(`Status: ${profile.status}`);
  console.log(`Content-Type: ${profile.contentType}`);
  console.log(`Body: ${profile.body}`);
  console.log(`Parsed:`, profile.parsed);
  console.log('');

  console.log('TEST: /api/user/orgs (Test Client)');
  const orgs = await makeRequest('GET', '/api/user/orgs', testUserId);
  console.log(`Status: ${orgs.status}`);
  console.log(`Content-Type: ${orgs.contentType}`);
  console.log(`Body: ${orgs.body}`);
  console.log(`Parsed:`, orgs.parsed);
  console.log('');

  console.log('TEST: /api/user/profile (Admin)');
  const adminProfile = await makeRequest('GET', '/api/user/profile', adminId);
  console.log(`Status: ${adminProfile.status}`);
  console.log(`Content-Type: ${adminProfile.contentType}`);
  console.log(`Body: ${adminProfile.body}`);
  console.log(`Parsed:`, adminProfile.parsed);
}

test().catch(console.error);
