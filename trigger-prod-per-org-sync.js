const https = require('https');

const PLATFORM_ADMIN_ID = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const API_HOST = 'api.victorysync.com';
const API_BASE = `https://${API_HOST}`;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: API_HOST,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': PLATFORM_ADMIN_ID,
      }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  try {
    console.log('1) Triggering global phone-number sync...');
    const global = await request('POST', '/api/admin/mightycall/sync', {});
    console.log('Global sync:', global.status, global.body);

    console.log('\n2) Fetching org list from production...');
    const orgsRes = await request('GET', '/api/admin/orgs', null);
    if (orgsRes.status !== 200) throw new Error('Failed to fetch orgs: ' + JSON.stringify(orgsRes));
    const orgs = orgsRes.body.orgs || orgsRes.body.organizations || [];
    console.log(`Found ${orgs.length} org(s)`);

    const startDate = '2025-08-01T00:00:00Z';
    const endDate = '2025-08-31T23:59:59Z';

    for (const org of orgs) {
      console.log('\n--- Org:', org.name || org.id, org.id, '---');
      console.log('Triggering call sync for Aug 2025...');
      const res = await request('POST', '/api/admin/mightycall/sync/calls', { orgId: org.id, dateStart: startDate, dateEnd: endDate });
      console.log('  Calls sync response:', res.status, res.body);

      // small delay to avoid hammering
      await new Promise(r => setTimeout(r, 500));

      // check call-stats
      const qs = `?org_id=${encodeURIComponent(org.id)}&start_date=2025-08-01&end_date=2025-08-31`;
      const stats = await request('GET', `/api/call-stats${qs}`);
      console.log('  Call-stats response:', stats.status, stats.body && stats.body.stats ? `stats totalCalls=${stats.body.stats.totalCalls}` : stats.body);

      // check recordings count
      const recs = await request('GET', `/api/admin/mightycall/call-history?orgId=${encodeURIComponent(org.id)}&limit=1`);
      console.log('  Call history sample response:', recs.status, Array.isArray(recs.body.calls) ? `${recs.body.calls.length} rows (sample)` : recs.body);
    }

    console.log('\nAll done.');
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  }
})();
