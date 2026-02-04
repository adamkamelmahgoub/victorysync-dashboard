const http = require('http');

async function testDownload() {
  const userId = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';
  const recordingId = '5b17558b-6cef-4058-873e-47a2dbdf3857';
  
  const opts = {
    hostname: 'localhost',
    port: 4000,
    path: `/api/recordings/${recordingId}/download`,
    method: 'GET',
    headers: {'x-user-id': userId}
  };
  
  return new Promise((resolve) => {
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log('Response:', data);
        try {
          const json = JSON.parse(data);
          console.log('Error:', json);
        } catch (e) {}
        resolve();
      });
    });
    req.on('error', e => console.error('Error:', e.message));
    req.end();
  });
}

testDownload();
