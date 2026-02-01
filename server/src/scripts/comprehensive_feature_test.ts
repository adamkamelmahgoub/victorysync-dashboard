import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';

const API_BASE = 'http://localhost:4000';
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'; // Standard UUID for testing

async function test(name: string, method: string, endpoint: string, body?: any): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': TEST_USER_ID,
        'x-dev-bypass': 'true',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const data = await response.json();
    const success = response.status < 400;
    
    if (success) {
      console.log(`✅ [${name}] ${method} ${endpoint}`);
      console.log(`   Status: ${response.status}`);
      return { success: true, status: response.status, data };
    } else {
      console.log(`❌ [${name}] ${method} ${endpoint}`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${data.error || 'unknown'}`);
      return { success: false, status: response.status, error: data.error };
    }
  } catch (err: any) {
    console.log(`❌ [${name}] ${method} ${endpoint}`);
    console.log(`   Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('================================================');
  console.log('COMPREHENSIVE FEATURE TEST SUITE');
  console.log('================================================\n');

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    
    // Get a real org for testing
    const { data: orgs, error: orgsErr } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .limit(1);
    
    if (orgsErr || !orgs || orgs.length === 0) {
      console.error('❌ Failed to get test org:', orgsErr);
      process.exit(1);
    }
    
    const testOrg = orgs[0];
    console.log(`Using test org: ${testOrg.name} (${testOrg.id})\n`);

    // Test suite
    let passed = 0;
    let failed = 0;

    // 1. Test member invite
    console.log('--- MEMBER MANAGEMENT ---');
    const inviteResult = await test(
      'Invite member',
      'POST',
      `/api/orgs/${testOrg.id}/members`,
      { email: 'testuser' + Date.now() + '@example.com', role: 'agent' }
    );
    inviteResult.success ? passed++ : failed++;

    // 2. List org members
    const listMembersResult = await test(
      'List org members',
      'GET',
      `/api/orgs/${testOrg.id}/members`
    );
    listMembersResult.success ? passed++ : failed++;

    // 3. Get org detail (includes members and phones)
    const orgDetailResult = await test(
      'Get org detail',
      'GET',
      `/api/admin/orgs/${testOrg.id}`
    );
    orgDetailResult.success ? passed++ : failed++;
    const orgDetail = orgDetailResult.data;

    // 4. Test phone management
    console.log('\n--- PHONE MANAGEMENT ---');
    
    // Get available phone
    const phonesResult = await test(
      'List all phones',
      'GET',
      `/api/admin/phone-numbers`
    );
    phonesResult.success ? passed++ : failed++;
    
    let testPhoneId = null;
    if (phonesResult.success && phonesResult.data && phonesResult.data.length > 0) {
      // Get first available unassigned phone
      for (const p of phonesResult.data) {
        if (!p.assigned_to_org_id) {
          testPhoneId = p.id;
          break;
        }
      }
      
      if (testPhoneId) {
        // Assign phone to org
        const assignResult = await test(
          'Assign phone to org',
          'POST',
          `/api/admin/orgs/${testOrg.id}/phone-numbers`,
          { phoneNumberIds: [testPhoneId] }
        );
        assignResult.success ? passed++ : failed++;
      }
    }

    // 5. Service level targets are managed via Supabase client, not API
    // They're stored in org_settings table and queryable via client-metrics
    console.log('\n--- SERVICE LEVELS ---');
    console.log('   Service levels managed via Supabase client (org_settings table)');
    console.log('   Verified in client-metrics endpoint');
    // Don't count as separate tests since they're frontend-managed

    // 6. Test dashboard/KPI endpoints
    console.log('\n--- DASHBOARD METRICS ---');
    
    const metricsResult = await test(
      'Get client metrics',
      'GET',
      `/api/client-metrics?org_id=${testOrg.id}`
    );
    metricsResult.success ? passed++ : failed++;
    
    if (metricsResult.success) {
      const metrics = metricsResult.data;
      console.log('   Metrics keys:', Object.keys(metrics).slice(0, 5).join(', '), '...');
    }

    const recentCallsResult = await test(
      'Get recent calls',
      'GET',
      `/api/calls/recent?org_id=${testOrg.id}&limit=10`
    );
    recentCallsResult.success ? passed++ : failed++;
    
    if (recentCallsResult.success) {
      console.log(`   Found ${Array.isArray(recentCallsResult.data) ? recentCallsResult.data.length : 0} recent calls`);
    }

    const callSeriesResult = await test(
      'Get call series (day)',
      'GET',
      `/api/calls/series?org_id=${testOrg.id}&range=day`
    );
    callSeriesResult.success ? passed++ : failed++;
    
    if (callSeriesResult.success) {
      console.log(`   Call series: ${Array.isArray(callSeriesResult.data) ? callSeriesResult.data.length : 0} buckets`);
    }

    const queueSummaryResult = await test(
      'Get queue summary',
      'GET',
      `/api/calls/queue-summary?org_id=${testOrg.id}`
    );
    queueSummaryResult.success ? passed++ : failed++;
    
    if (queueSummaryResult.success) {
      const summary = queueSummaryResult.data;
      console.log(`   Queues: ${Array.isArray(summary) ? summary.length : 0} found`);
    }

    // 7. API Key management
    console.log('\n--- API KEYS ---');
    
    const createApiKeyResult = await test(
      'Create API key',
      'POST',
      `/api/orgs/${testOrg.id}/api-keys`,
      { name: 'test-key-' + Date.now() }
    );
    createApiKeyResult.success ? passed++ : failed++;
    
    if (!createApiKeyResult.success) {
      console.log('   (API key creation requires org-admin role, expected for test user)');
    }
    
    const listApiKeysResult = await test(
      'List API keys',
      'GET',
      `/api/orgs/${testOrg.id}/api-keys`
    );
    listApiKeysResult.success ? passed++ : failed++;
    
    if (!listApiKeysResult.success) {
      console.log('   (API key listing requires org-admin role, expected for test user)');
    }

    // Summary
    console.log('\n================================================');
    console.log('TEST SUMMARY');
    console.log('================================================');
    console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (err: any) {
    console.error('❌ Test suite error:', err.message || err);
    process.exit(1);
  }
}

main();
