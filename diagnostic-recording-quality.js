#!/usr/bin/env node

/**
 * Diagnostic script to check recording data quality and suggest fixes
 */

const http = require('http');

async function makeRequest(method, pathname, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: pathname,
      method: method,
      headers: {
        'x-user-id': 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a',
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, parsed, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, parsed: null, raw: data });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runDiagnostics() {
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║        RECORDING DATA QUALITY DIAGNOSTIC                  ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  try {
    // Get all organizations first
    console.log('STEP 1: Fetching all organizations...\n');
    const orgsRes = await makeRequest('GET', '/api/admin/orgs');
    
    if (orgsRes.status !== 200) {
      console.log('❌ Could not fetch organizations');
      return;
    }

    const orgs = orgsRes.parsed.orgs || [];
    console.log(`✅ Found ${orgs.length} organizations\n`);

    // For each org, check recording data quality
    for (const org of orgs.slice(0, 3)) { // Check first 3 orgs
      console.log(`────────────────────────────────────────────────────────────`);
      console.log(`Organization: ${org.name} (${org.id})`);
      console.log(`────────────────────────────────────────────────────────────`);

      // Fetch recordings for this org
      const recsRes = await makeRequest('GET', `/api/recordings?org_id=${org.id}&limit=20`);
      
      if (recsRes.status === 200) {
        const recordings = recsRes.parsed.recordings || [];
        console.log(`  📼 Found ${recordings.length} recordings`);

        if (recordings.length > 0) {
          // Analyze data quality
          const withDuration = recordings.filter(r => (r.duration || 0) > 0);
          const withNumbers = recordings.filter(r => {
            const from = r.from_number || r.display_name?.split('→')[0]?.trim();
            const to = r.to_number || r.display_name?.split('→')[1]?.trim();
            return from && from !== 'Unknown' && to && to !== 'Unknown';
          });
          const withDates = recordings.filter(r => r.recording_date || r.call_started_at);

          console.log(`  📊 Data Quality:`);
          console.log(`     Duration: ${withDuration.length}/${recordings.length} (${Math.round((withDuration.length/recordings.length)*100)}%)`);
          console.log(`     Phone Numbers: ${withNumbers.length}/${recordings.length} (${Math.round((withNumbers.length/recordings.length)*100)}%)`);
          console.log(`     Dates: ${withDates.length}/${recordings.length} (${Math.round((withDates.length/recordings.length)*100)}%)`);

          // Show sample
          const sample = recordings[0];
          console.log(`  📝 Sample Recording:`);
          console.log(`     From: ${sample.from_number || 'Missing'}`);
          console.log(`     To: ${sample.to_number || 'Missing'}`);
          console.log(`     Duration: ${sample.duration || 'Missing'}s`);
          console.log(`     Date: ${sample.recording_date || sample.call_started_at || 'Missing'}`);
          console.log(`     Display Name: ${sample.display_name || 'N/A'}`);

          // Issue diagnosis
          console.log(`  🔍 Issues Found:`);
          if (withDuration.length === 0) {
            console.log(`     ⚠️  NO DURATION DATA - Recording data needs sync`);
            console.log(`         Action: Trigger recording sync via /api/mightycall/sync/recordings`);
          }
          if (withNumbers.length < recordings.length * 0.8) {
            console.log(`     ⚠️  INCOMPLETE PHONE NUMBERS - May need data enrichment`);
          }
        }
      } else {
        console.log(`  ❌ Could not fetch recordings (${recsRes.status})`);
      }

      console.log('');
    }

    console.log(`╔════════════════════════════════════════════════════════════╗`);
    console.log(`║                   DIAGNOSTIC COMPLETE                     ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝\n`);

    console.log(`RECOMMENDATIONS:`);
    console.log(`1. If durations are missing: Run recording sync endpoint`);
    console.log(`   POST /api/mightycall/sync/recordings with orgId`);
    console.log(`2. If phone numbers are incomplete: Check MightyCall metadata`);
    console.log(`3. Frontend now has fallback: If call-stats fails, uses recordings`);
    console.log('\n');

  } catch (err) {
    console.error('❌ Diagnostic error:', err.message);
    process.exit(1);
  }
}

runDiagnostics();
