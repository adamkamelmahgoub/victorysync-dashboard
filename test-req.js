const http = require('http');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/recordings?org_id=test-org',
  method: 'GET',
  headers: {'x-user-id': 'test-user'}
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try { console.log(JSON.stringify(JSON.parse(data), null, 2)); } catch(e) { console.log(data); }
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

req.end();
