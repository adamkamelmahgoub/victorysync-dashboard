const http = require('http');

async function testDownload() {
  const userId = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';
  const recordingId = '5b17558b-6cef-4058-873e-47a2dbdf3857';
  
  console.log(`Testing download endpoint for recording: ${recordingId}\n`);
  
  const opts = {
    hostname: 'localhost',
    port: 4000,
    path: `/api/recordings/${recordingId}/download`,
    method: 'GET',
    headers: {'x-user-id': userId}
  };
  
  return new Promise((resolve) => {
    const req = http.request(opts, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log('Headers:', {
        'content-type': res.headers['content-type'],
        'content-length': res.headers['content-length'],
        'content-disposition': res.headers['content-disposition']
      });
      
      let size = 0;
      res.on('data', chunk => size += chunk.length);
      res.on('end', () => {
        console.log(`\nDownloaded ${size} bytes`);
        if (size > 0) {
          console.log('✅ Download working - file received');
        } else {
          console.log('❌ No data received');
        }
        resolve();
      });
    });
    
    req.on('error', e => {
      console.error('❌ Request error:', e.message);
      resolve();
    });
    
    req.end();
  });
}

testDownload();
