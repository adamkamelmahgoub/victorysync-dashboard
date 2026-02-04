#!/usr/bin/env node

// Wait a moment for the server to be ready
setTimeout(() => {
  const http = require('http');

  const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
  const ADMIN = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
  const HOST = 'localhost:4000';

  const options = {
    hostname: HOST.split(':')[0],
    port: 4000,
    path: `/api/recordings?org_id=${ORG}&limit=3`,
    method: 'GET',
    headers: { 'x-user-id': ADMIN }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('Status:', res.statusCode);
        if (data.recordings && data.recordings.length > 0) {
          console.log('Recordings found:', data.recordings.length);
          const rec = data.recordings[0];
          console.log('Sample recording:');
          console.log('  - id:', rec.id);
          console.log('  - from_number:', rec.from_number);
          console.log('  - to_number:', rec.to_number);
          console.log('  - duration:', rec.duration);
          console.log('  - recording_date:', rec.recording_date);
        } else {
          console.log('No recordings found');
        }
      } catch(e) {
        console.error('Parse error:', e.message);
      }
      process.exit(0);
    });
  });

  req.on('error', (e) => {
    console.error('Error:', e.message);
    process.exit(1);
  });

  req.end();
}, 1000);
