// Quick script to sync August 2025 data and check DB
const { createClient } = require('@supabase/supabase-js');
const http = require('http');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const platformAdminId = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';

async function httpPost(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      method: 'POST',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': platformAdminId
      }
    };

    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  try {
    console.log('=== Syncing MightyCall data for August 2025 ===\n');

    // Fetch orgs
    console.log('Fetching organizations...');
    const { data: orgs, error: orgError } = await supabaseAdmin.from('organizations').select('id, name');
    if (orgError) throw orgError;
    console.log(`Found ${orgs.length} organizations`);
    
    if (!orgs || orgs.length === 0) {
      console.log('No organizations found. Exiting.');
      process.exit(0);
    }

    // Try hitting the admin sync endpoint
    console.log('\nCalling POST /api/admin/mightycall/sync endpoint...');
    try {
      const syncRes = await httpPost('http://localhost:4000/api/admin/mightycall/sync', {});
      console.log(`Sync endpoint response (${syncRes.status}):`, syncRes.body);
    } catch (e) {
      console.warn('Endpoint call failed (server may not be ready):', e.message);
    }

    // August 2025 date range
    const augStart = '2025-08-01T00:00:00Z';
    const augEnd = '2025-08-31T23:59:59Z';

    // Sync calls and reports for each org
    for (const org of orgs) {
      console.log(`\n--- Organization: ${org.name} (${org.id}) ---`);

      // Try sync/calls endpoint if available
      try {
        const callSyncRes = await httpPost('http://localhost:4000/api/admin/mightycall/sync/calls', {
          orgId: org.id,
          dateStart: augStart,
          dateEnd: augEnd
        });
        console.log(`  Sync calls response (${callSyncRes.status}):`, callSyncRes.body);
      } catch (e) {
        console.warn(`  Sync calls failed: ${e.message}`);
      }

      // Check DB for mightycall_reports in August 2025
      const { data: reports, error: repError } = await supabaseAdmin
        .from('mightycall_reports')
        .select('*', { count: 'exact' })
        .eq('org_id', org.id)
        .gte('report_date', augStart)
        .lte('report_date', augEnd);
      if (!repError) {
        console.log(`  mightycall_reports (Aug 2025): ${reports.length} rows`);
      }

      // Check DB for mightycall_recordings in August 2025
      const { data: recs, error: recError } = await supabaseAdmin
        .from('mightycall_recordings')
        .select('*', { count: 'exact' })
        .eq('org_id', org.id)
        .gte('recording_date', augStart)
        .lte('recording_date', augEnd);
      if (!recError) {
        console.log(`  mightycall_recordings (Aug 2025): ${recs.length} rows`);
      }

      // Check DB for calls in August 2025
      const { data: calls, error: callError } = await supabaseAdmin
        .from('calls')
        .select('*', { count: 'exact' })
        .eq('org_id', org.id)
        .gte('started_at', augStart)
        .lte('started_at', augEnd);
      if (!callError) {
        console.log(`  calls (Aug 2025): ${calls.length} rows`);
      }

      // Show sample phone numbers for filtering
      const { data: phones } = await supabaseAdmin
        .from('phone_numbers')
        .select('id, number')
        .eq('org_id', org.id)
        .limit(3);
      if (phones && phones.length > 0) {
        console.log(`  Sample phone numbers (for filtering):`, phones.map(p => p.number).join(', '));
      }
    }

    console.log('\n=== Done ===');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
