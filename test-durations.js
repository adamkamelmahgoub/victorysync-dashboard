const https = require('https');

const testUser = {
  id: 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a'
};

const testOrgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';

async function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: 'GET',
      headers: {
        'x-user-id': testUser.id,
        'Content-Type': 'application/json'
      }
    };

    const req = require('http').request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function test() {
  console.log('\n🎯 CHECKING DURATION VALUES IN RECORDINGS\n');

  const response = await makeRequest(`/api/mightycall/recordings?org_id=${testOrgId}&limit=10`);
  
  if (response.recordings && response.recordings.length > 0) {
    console.log(`Found ${response.recordings.length} recordings. Duration breakdown:\n`);
    
    response.recordings.forEach((r, i) => {
      const dur = r.duration_seconds || 0;
      const durMin = dur / 60;
      console.log(`${i+1}. Duration: ${dur}s = ${durMin.toFixed(2)}min`);
    });

    console.log('\n📊 STATS:');
    const durations = response.recordings.map(r => r.duration_seconds || 0).filter(d => d > 0);
    const total = durations.reduce((a, b) => a + b, 0);
    const avg = durations.length > 0 ? total / durations.length : 0;
    console.log(`  Total calls with duration: ${durations.length}`);
    console.log(`  Total seconds: ${total}`);
    console.log(`  Average seconds: ${avg.toFixed(2)}`);
    console.log(`  Average minutes: ${(avg / 60).toFixed(2)}`);
  }
}

test().catch(console.error);
