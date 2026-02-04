const https = require('https');

const PLATFORM_ADMIN_ID = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const PROD_URL = 'https://api.victorysync.com/api/admin/mightycall/sync';

function post(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': PLATFORM_ADMIN_ID,
        'Content-Length': 2
      }
    };

    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write('{}');
    req.end();
  });
}

(async () => {
  try {
    console.log('Posting to', PROD_URL);
    const res = await post(PROD_URL);
    console.log('Response status:', res.status);
    console.log('Body:', res.body);
  } catch (e) {
    console.error('Request failed:', e.message || e);
    process.exit(2);
  }
})();
