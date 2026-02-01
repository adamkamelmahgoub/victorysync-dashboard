const http = require('http');

const orgId = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
const baseDate = new Date();

async function seedCall(index) {
  const startTime = new Date(baseDate.getTime() - (index * 2 * 60 * 60 * 1000)).toISOString();
  const endTime = new Date(baseDate.getTime() - ((index - 1) * 2 * 60 * 60 * 1000)).toISOString();
  
  const payload = {
    org_id: orgId,
    direction: index % 2 === 0 ? 'outbound' : 'inbound',
    status: index % 3 === 0 ? 'missed' : 'answered',
    from_number: `+1555000${String(1000 + index).slice(-4)}`,
    to_number: '+18482161220',
    started_at: startTime,
    answered_at: startTime,
    ended_at: endTime,
    duration: Math.min(300, 60 * index)
  };

  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/api/dev/seed-call',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        console.log(`Call ${index} seeded`);
        resolve();
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  try {
    for (let i = 1; i <= 8; i++) {
      await seedCall(i);
      await new Promise(r => setTimeout(r, 100));
    }
    console.log('\nSuccessfully seeded 8 test calls');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding calls:', err);
    process.exit(1);
  }
}

main();
