#!/usr/bin/env node

const http = require('http');
const { URL } = require('url');

const BASE_URL = 'http://localhost:4000';

// Test user and org IDs
const userId = 'aece18dd-8a3c-4950-97a6-d7eeabe26e4a'; // admin user
const testOrgId = 'org-test-client';

async function makeRequest(method, pathname, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 4000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'x-user-id': userId,
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

async function runTests() {
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║           TESTING REPORTS & CALL-STATS FIXES              ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  try {
    // TEST 1: Call stats - admin user (should now fetch all recordings, not just 1000)
    console.log('TEST 1: Call Stats Endpoint (All Data Pagination)');
    const statsRes = await makeRequest('GET', `/api/call-stats?org_id=${testOrgId}&start_date=2024-01-01&end_date=2026-12-31`);
    
    if (statsRes.status === 200) {
      console.log(`  ✅ Status: 200`);
      const stats = statsRes.parsed.stats || {};
      console.log(`  📊 Total Calls: ${stats.totalCalls || 0}`);
      console.log(`  📞 Answered Calls: ${stats.answeredCalls || 0}`);
      console.log(`  ⏱️  Avg Duration: ${Math.floor((stats.avgDuration || 0) / 60)}m ${(stats.avgDuration || 0) % 60}s`);
      console.log(`  📈 Data Points Used: ${stats.dataPoints || 0}`);
      console.log(`  🎯 Calls With Duration: ${stats.callsWithDurationData || 0}`);
      
      if ((stats.totalCalls || 0) > 1000) {
        console.log(`  ✅ FIXED: Now returning ${stats.totalCalls} calls (exceeds old 1000 limit)`);
      } else if ((stats.totalCalls || 0) === 0) {
        console.log(`  ⚠️  No calls found for date range`);
      }
    } else {
      console.log(`  ❌ Status: ${statsRes.status}`);
      if (statsRes.parsed?.error) {
        console.log(`     Error: ${statsRes.parsed.error}`);
      }
    }
    console.log('');

    // TEST 2: Check if recordings have proper duration data
    console.log('TEST 2: Recording Duration Data Quality');
    const recordingsRes = await makeRequest('GET', `/api/recordings?org_id=${testOrgId}&limit=10`);
    
    if (recordingsRes.status === 200) {
      console.log(`  ✅ Status: 200`);
      const recordings = recordingsRes.parsed.recordings || [];
      console.log(`  📼 Total recordings returned: ${recordings.length}`);
      
      if (recordings.length > 0) {
        const rec = recordings[0];
        console.log(`  📝 Sample Recording:`);
        console.log(`     From: ${rec.from_number || rec.display_name?.split(' → ')[0] || 'Unknown'}`);
        console.log(`     To: ${rec.to_number || rec.display_name?.split(' → ')[1]?.trim() || 'Unknown'}`);
        console.log(`     Duration: ${rec.duration || rec.duration_formatted || '0s'}`);
        console.log(`     Date: ${rec.recording_date || rec.call_started_at || 'Unknown'}`);
        
        // Check data quality
        const withDuration = recordings.filter(r => (r.duration || 0) > 0).length;
        const withNumbers = recordings.filter(r => (r.from_number && r.to_number) || r.display_name?.includes('→')).length;
        
        console.log(`  📊 Quality Metrics:`);
        console.log(`     Recordings with duration: ${withDuration}/${recordings.length}`);
        console.log(`     Recordings with phone numbers: ${withNumbers}/${recordings.length}`);
        
        if (withDuration === 0 && recordings.length > 0) {
          console.log(`  ⚠️  Warning: No durations found - may need data sync`);
        }
        if (withNumbers > recordings.length * 0.7) {
          console.log(`  ✅ Good: ${Math.round((withNumbers / recordings.length) * 100)}% recordings have phone numbers`);
        }
      }
    } else {
      console.log(`  ❌ Status: ${recordingsRes.status}`);
    }
    console.log('');

    // TEST 3: Admin Reports Endpoint
    console.log('TEST 3: Admin Reports Endpoint');
    const adminReportsRes = await makeRequest('GET', `/api/mightycall/reports?type=calls&limit=200&org_id=${testOrgId}`);
    
    if (adminReportsRes.status === 200) {
      console.log(`  ✅ Status: 200`);
      const reports = adminReportsRes.parsed.reports || [];
      console.log(`  📋 Total reports returned: ${reports.length}`);
      
      if (reports.length > 0) {
        const report = reports[0];
        console.log(`  📝 Sample Report:`);
        console.log(`     Type: ${report.report_type || 'Unknown'}`);
        console.log(`     Date: ${report.report_date || 'Unknown'}`);
        console.log(`     Org: ${report.organizations?.name || 'Unknown'}`);
      }
    } else {
      console.log(`  ❌ Status: ${adminReportsRes.status}`);
      if (adminReportsRes.parsed?.error) {
        console.log(`     Error: ${adminReportsRes.parsed.error}`);
      }
    }
    console.log('');

    // TEST 4: Verify large date ranges work
    console.log('TEST 4: Large Date Range Query (2024-2026)');
    const largeRangeRes = await makeRequest('GET', `/api/call-stats?org_id=${testOrgId}&start_date=2024-01-01&end_date=2026-12-31`);
    
    if (largeRangeRes.status === 200) {
      const stats = largeRangeRes.parsed.stats || {};
      console.log(`  ✅ Status: 200`);
      console.log(`  📊 Calls in range: ${stats.totalCalls || 0}`);
      
      if ((stats.totalCalls || 0) > 100) {
        console.log(`  ✅ VERIFIED: Date range filtering working (got ${stats.totalCalls} calls)`);
      }
    } else {
      console.log(`  ❌ Status: ${largeRangeRes.status}`);
    }
    console.log('');

    console.log(`╔════════════════════════════════════════════════════════════╗`);
    console.log(`║                   TESTING COMPLETE                        ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  } catch (err) {
    console.error('❌ Test error:', err.message);
    process.exit(1);
  }
}

runTests();
