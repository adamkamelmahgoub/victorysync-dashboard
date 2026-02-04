const https = require('https');

const PLATFORM_ADMIN_ID = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
const API_HOST = 'api.victorysync.com';

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
    console.log('\n=== COMPREHENSIVE GLOBAL MIGHTYCALL SYNC ===\n');

    console.log('Step 1: Global phone-number + extensions sync...');
    const globalSync = await request('POST', '/api/admin/mightycall/sync', {});
    console.log('✓ Global sync result:', globalSync.status, globalSync.body);

    console.log('\nStep 2: Fetching all organizations...');
    const orgsRes = await request('GET', '/api/admin/orgs', null);
    if (orgsRes.status !== 200) throw new Error('Failed to fetch orgs');
    const orgs = orgsRes.body.orgs || orgsRes.body.organizations || [];
    console.log(`✓ Found ${orgs.length} organization(s)`);

    // Date ranges for comprehensive data fetch
    const MONTH_AGO = '2025-01-01T00:00:00Z'; // Last few months
    const NOW = '2025-12-31T23:59:59Z'; // Future-proof through end of 2025

    let totalStats = {
      calls: 0,
      voicemails: 0,
      contacts: 0,
      recordings: 0,
      reports: 0
    };

    for (const org of orgs) {
      const orgName = org.name || org.id;
      console.log(`\n--- Organization: ${orgName} ---`);

      // 1) Sync calls
      try {
        console.log('  • Syncing calls...');
        const callRes = await request('POST', '/api/admin/mightycall/sync/calls', {
          orgId: org.id,
          dateStart: MONTH_AGO,
          dateEnd: NOW
        });
        if (callRes.status === 200) {
          totalStats.calls += callRes.body.calls || 0;
          console.log(`    ✓ Calls: ${callRes.body.calls || 0} synced`);
        } else {
          console.log(`    ⚠ Calls failed (${callRes.status}):`, callRes.body?.error || callRes.body);
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.log(`    ✗ Calls error:`, e.message);
      }

      // 2) Sync voicemails
      try {
        console.log('  • Syncing voicemails...');
        const vmRes = await request('POST', '/api/admin/mightycall/sync/voicemails', {
          orgId: org.id
        });
        if (vmRes.status === 200) {
          totalStats.voicemails += vmRes.body.voicemails || 0;
          console.log(`    ✓ Voicemails: ${vmRes.body.voicemails || 0} synced`);
        } else {
          console.log(`    ⚠ Voicemails failed (${vmRes.status}):`, vmRes.body?.error || vmRes.body);
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.log(`    ✗ Voicemails error:`, e.message);
      }

      // 3) Sync contacts
      try {
        console.log('  • Syncing contacts...');
        const contactRes = await request('POST', '/api/admin/mightycall/sync/contacts', {
          orgId: org.id
        });
        if (contactRes.status === 200) {
          totalStats.contacts += contactRes.body.contacts || 0;
          console.log(`    ✓ Contacts: ${contactRes.body.contacts || 0} synced`);
        } else {
          console.log(`    ⚠ Contacts failed (${contactRes.status}):`, contactRes.body?.error || contactRes.body);
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.log(`    ✗ Contacts error:`, e.message);
      }

      // 4) Sync reports (includes recordings)
      try {
        console.log('  • Syncing reports & recordings...');
        const reportRes = await request('POST', '/api/admin/mightycall/fetch-reports', {
          org_id: org.id,
          start_date: MONTH_AGO,
          end_date: NOW,
          report_type: 'all'
        });
        if (reportRes.status === 200) {
          const rep = reportRes.body.reports_synced || 0;
          const rec = reportRes.body.recordings_synced || 0;
          totalStats.reports += rep;
          totalStats.recordings += rec;
          console.log(`    ✓ Reports: ${rep}, Recordings: ${rec} synced`);
        } else {
          console.log(`    ⚠ Reports failed (${reportRes.status}):`, reportRes.body?.error || reportRes.body);
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.log(`    ✗ Reports error:`, e.message);
      }

      await new Promise(r => setTimeout(r, 500)); // Pause between orgs
    }

    console.log('\n=== SYNC SUMMARY ===');
    console.log(`✓ Calls synced:       ${totalStats.calls}`);
    console.log(`✓ Voicemails synced:  ${totalStats.voicemails}`);
    console.log(`✓ Contacts synced:    ${totalStats.contacts}`);
    console.log(`✓ Reports synced:     ${totalStats.reports}`);
    console.log(`✓ Recordings synced:  ${totalStats.recordings}`);
    console.log('\n✓ Global sync complete. Data should now be available on the frontend.\n');
  } catch (e) {
    console.error('✗ Error:', e.message || e);
    process.exit(1);
  }
})();
