const https = require('https');

const PLATFORM_ADMIN_ID = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const API_HOST = 'api.victorysync.com';
const API_BASE = `https://${API_HOST}`;

function request(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: API_HOST,
      path,
      method,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'x-user-id': PLATFORM_ADMIN_ID,
      }, extraHeaders)
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
    console.log('1) Triggering global phone-number+calls sync...');
    const global = await request('POST', '/api/admin/mightycall/sync', {});
    console.log('Global sync:', global.status, global.body);

    console.log('\n2) Fetching org list from production...');
    const orgsRes = await request('GET', '/api/admin/orgs', null);
    if (orgsRes.status !== 200) throw new Error('Failed to fetch orgs: ' + JSON.stringify(orgsRes));
    const orgs = orgsRes.body.orgs || orgsRes.body.organizations || [];
    console.log(`Found ${orgs.length} org(s)`);

    const augStart = '2025-08-01T00:00:00Z';
    const augEnd = '2025-08-31T23:59:59Z';

    for (const org of orgs) {
      console.log('\n--- Org:', org.name || org.id, org.id, '---');

      // 1) Sync recent/full calls (no date) then Aug 2025 specifically
      console.log('Triggering call sync (no date)...');
      const callsAll = await request('POST', '/api/admin/mightycall/sync/calls', { orgId: org.id });
      console.log('  Calls(all) sync response:', callsAll.status, callsAll.body);

      await new Promise(r => setTimeout(r, 400));

      console.log('Triggering call sync (Aug 2025)...');
      const callsAug = await request('POST', '/api/admin/mightycall/sync/calls', { orgId: org.id, dateStart: augStart, dateEnd: augEnd });
      console.log('  Calls(Aug2025) sync response:', callsAug.status, callsAug.body);

      await new Promise(r => setTimeout(r, 400));

      // 2) Sync voicemails
      console.log('Triggering voicemail sync...');
      const vms = await request('POST', '/api/admin/mightycall/sync/voicemails', { orgId: org.id });
      console.log('  Voicemail sync response:', vms.status, vms.body);

      await new Promise(r => setTimeout(r, 400));

      // 3) Sync contacts
      console.log('Triggering contacts sync...');
      const contacts = await request('POST', '/api/admin/mightycall/sync/contacts', { orgId: org.id });
      console.log('  Contacts sync response:', contacts.status, contacts.body);

      await new Promise(r => setTimeout(r, 400));

      // 4) Attempt recordings sync (non-admin endpoint; may require api-key)
      try {
        console.log('Attempting recordings sync endpoint (may require API key)...');
        const rec = await request('POST', '/api/mightycall/sync/recordings', { orgId: org.id });
        console.log('  Recordings sync response:', rec.status, rec.body);
      } catch (e) {
        console.warn('  Recordings sync request failed:', e.message || e);
      }

      await new Promise(r => setTimeout(r, 400));

      // 5) Verify sample data via admin read endpoints
      const statsQs = `?org_id=${encodeURIComponent(org.id)}&start_date=2025-08-01&end_date=2025-08-31`;
      const stats = await request('GET', `/api/call-stats${statsQs}`);
      console.log('  Call-stats response:', stats.status, stats.body && stats.body.stats ? `totalCalls=${stats.body.stats.totalCalls}` : stats.body);

      const history = await request('GET', `/api/admin/mightycall/call-history?orgId=${encodeURIComponent(org.id)}&limit=5`);
      console.log('  Call history sample:', history.status, Array.isArray(history.body.calls) ? `${history.body.calls.length} rows` : history.body);

      const voicemailList = await request('GET', `/api/admin/mightycall/voicemails?orgId=${encodeURIComponent(org.id)}&limit=5`);
      console.log('  Voicemail sample:', voicemailList.status, Array.isArray(voicemailList.body.voicemails) ? `${voicemailList.body.voicemails.length} rows` : voicemailList.body);

      const contactsList = await request('GET', `/api/admin/mightycall/contacts?orgId=${encodeURIComponent(org.id)}&limit=5`);
      console.log('  Contacts sample:', contactsList.status, Array.isArray(contactsList.body.contacts) ? `${contactsList.body.contacts.length} rows` : contactsList.body);

      // small delay between orgs
      await new Promise(r => setTimeout(r, 800));
    }

    console.log('\nAll done.');
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  }
})();
