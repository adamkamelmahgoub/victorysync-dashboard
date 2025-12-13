const http = require('http');
const { URL } = require('url');

const BASE = process.env.CLIENT_BASE || 'http://127.0.0.1:3000';
const DASH = process.env.DASH_PATH || '/dashboard';

function makeRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const options = { hostname: u.hostname, port: Number(u.port || 80), path: u.pathname + u.search, method, timeout: 5000 };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

(async function(){
  try {
    console.log('Boot check running:', BASE + DASH);
    const home = await makeRequest(DASH);
    if (home.status !== 200) {
      console.error('Root GET failed:', home.status);
      console.log('Body snippet:', (home.body||'').slice(0,200));
      process.exit(2);
    }
    console.log('Got index.html; scanning for assets...');
    const body = home.body || '';
    const assets = [];
    const re = /<script[^>]+src="([^"]+)"/g;
    let m;
    while ((m = re.exec(body)) !== null) assets.push(m[1]);
    const cssRe = /<link[^>]+href="([^"]+)"/g;
    while ((m = cssRe.exec(body)) !== null) assets.push(m[1]);
    console.log('Assets found:', assets);
    for (const a of assets) {
      const url = a.startsWith('/') ? a : '/' + a;
      console.log('HEAD', url);
      try {
        const res = await makeRequest(url, 'HEAD');
        console.log(' ', url, '->', res.status);
        if (res.status >= 400) {
          console.error('Asset 404:', url, 'status', res.status);
          process.exit(3);
        }
      } catch (e) {
        console.error('Error fetching asset HEAD:', url, e.message);
        process.exit(4);
      }
    }
    console.log('Assets OK. Boot check PASSED');
    process.exit(0);
  } catch (err) {
    console.error('Boot check error:', err.message, err.stack);
    process.exit(1);
  }
})();
