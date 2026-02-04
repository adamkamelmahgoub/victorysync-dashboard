// Simple synchronous test using only built-in modules
const https = require('https');
const agent = new https.Agent({ keepAliveTimeout: 1000 });

const ADMIN = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

const options = {
  hostname: 'api.victorysync.com',
  path: `/api/recordings?org_id=${ORG}&limit=1`,
  method: 'GET',
  headers: { 'x-user-id': ADMIN },
  agent,
  timeout: 3000
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const json = JSON.parse(data);
      if (json.recordings && json.recordings.length > 0) {
        const r = json.recordings[0];
        console.log('Recording:', {
          duration: r.duration,
          from: r.from_number,
          to: r.to_number,
          date: r.recording_date
        });
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.log('Error:', e.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('Timeout');
  req.destroy();
  process.exit(1);
});

req.end();
