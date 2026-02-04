const https = require('https');

const ADMIN = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

// Test with larger limit
const options = {
  hostname: 'api.victorysync.com',
  path: `/api/recordings?org_id=${ORG}&limit=50`,
  method: 'GET',
  headers: { 'x-user-id': ADMIN },
  timeout: 5000
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('✅ API Response Status:', res.statusCode);
      console.log(`✅ Total Recordings: ${json.recordings?.length || 0}`);
      
      if (json.recordings && json.recordings.length > 0) {
        console.log('\n📊 Recording Sample Data:');
        json.recordings.slice(0, 5).forEach((r, i) => {
          console.log(`\n[${i + 1}] Recording:`);
          console.log(`    Duration: ${r.duration || r.duration_seconds} seconds`);
          console.log(`    From: ${r.from_number || 'N/A'}`);
          console.log(`    To: ${r.to_number || 'N/A'}`);
          console.log(`    Date: ${r.recording_date?.split('T')[0] || 'N/A'}`);
          console.log(`    Org: ${r.org_name || 'N/A'}`);
        });
        
        // Summary statistics
        const withDuration = json.recordings.filter(r => r.duration || r.duration_seconds).length;
        const withPhones = json.recordings.filter(r => r.from_number && r.to_number).length;
        const withDates = json.recordings.filter(r => r.recording_date).length;
        
        console.log('\n📈 Data Quality Metrics:');
        console.log(`    ✅ ${withDuration}/${json.recordings.length} have duration`);
        console.log(`    ✅ ${withPhones}/${json.recordings.length} have phone numbers`);
        console.log(`    ✅ ${withDates}/${json.recordings.length} have dates`);
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.log('Request error:', e.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('Request timeout');
  req.destroy();
  process.exit(1);
});

req.end();
