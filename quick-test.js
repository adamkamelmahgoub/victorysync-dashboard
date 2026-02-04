const fetch = require('node-fetch');

async function test() {
  try {
    console.log('Testing API endpoints...\n');

    // Test 1: No user ID
    console.log('Test 1: Request without user ID');
    let res = await fetch('http://localhost:4000/api/recordings?org_id=test-org');
    let text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text.substring(0, 200));

    // Test 2: With user ID but invalid org
    console.log('\nTest 2: Request with user ID, invalid org');
    res = await fetch('http://localhost:4000/api/recordings?org_id=test-org', {
      headers: { 'x-user-id': 'test-user' }
    });
    text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text.substring(0, 300));

    // Test 3: Check if server is responsive
    console.log('\nTest 3: Health check');
    res = await fetch('http://localhost:4000/health');
    text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text.substring(0, 200));

  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

setTimeout(() => {
  console.error('Timeout - API not responding');
  process.exit(1);
}, 5000);

test();
