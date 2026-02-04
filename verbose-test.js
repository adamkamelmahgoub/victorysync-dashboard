const http = require('http');

console.log('Making request to localhost:4000/api/health');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/health',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  console.log('Got response, statusCode:', res.statusCode);
  res.on('data', chunk => {
    console.log('Got data chunk');
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response complete');
    console.log('Health Status:', res.statusCode);
    console.log('Data:', data.substring(0, 100));
    console.log('Exiting...');
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('Error:', err);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('Timeout');
  req.destroy();
  process.exit(1);
});

console.log('Request object created, setting timeout to 5000ms');
req.setTimeout(5000);

console.log('Ending request...');
req.end();

console.log('Request sent');
