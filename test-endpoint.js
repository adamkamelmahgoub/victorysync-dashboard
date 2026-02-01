const http = require('http');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/call-stats?org_id=cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1&start_date=2025-01-01&end_date=2025-12-31',
  method: 'GET',
  headers: {
    'x-user-id': '9a303c48-2343-4438-832c-7f1268781b6d'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.log('Raw response:', data);
    }
    process.exit(0);
  });
});

req.on('error', (error) => {
  console.error('Request failed:', error);
  process.exit(1);
});

req.end();
