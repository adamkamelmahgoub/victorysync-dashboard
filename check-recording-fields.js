const http = require('http');

function req(path, userId) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'localhost',
      port: 4000,
      path,
      method: 'GET',
      headers: {'x-user-id': userId}
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({error: data.slice(0,200)});
        }
      });
    });
    r.on('error', e => resolve({error: e.message}));
    r.end();
  });
}

(async () => {
  const userId = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a';
  const orgId = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
  
  console.log('Fetching first recording to check fields...\n');
  const res = await req(`/api/recordings?org_id=${orgId}&limit=1`, userId);
  
  if (res.recordings && res.recordings[0]) {
    const r = res.recordings[0];
    console.log('Recording fields available:');
    console.log(JSON.stringify(r, null, 2).slice(0, 1500));
  } else {
    console.log('Error:', res);
  }
})();
