const http = require('http');

// Try IPv4 explicitly
const options = {
  hostname: '127.0.0.1',
  port: 4000,
  path: '/api/admin/orgs',
  method: 'GET'
};

console.log('Attempting to connect to 127.0.0.1:4000...');

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Data length:', data.length);
    if (data.length < 200) console.log('Data:', data);
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('Connection error:', err.code, err.message);
  process.exit(1);
});

req.setTimeout(3000);
req.end();
