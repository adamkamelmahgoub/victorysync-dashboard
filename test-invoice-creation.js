const http = require('http');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/admin/billing/invoices',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': '5a055f52-9ff8-49d3-9583-9903d5350c3e'
  }
};

const data = JSON.stringify({
  org_id: '123e4567-e89b-12d3-a456-426614174000',
  items: []
});

const req = http.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => { responseData += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      console.log('Response:', JSON.stringify(JSON.parse(responseData), null, 2));
    } catch (e) {
      console.log('Response:', responseData);
    }
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

req.write(data);
req.end();

// Timeout after 10 seconds
setTimeout(() => {
  console.error('Request timeout');
  process.exit(1);
}, 10000);
