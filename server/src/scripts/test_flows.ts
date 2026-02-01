import '../config/env';
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:4000';
const TEST_ORG_ID = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
const TEST_USER_ID = 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a'; // adam@victorysync.com

interface TestResult {
  name: string;
  endpoint: string;
  method: string;
  status: number;
  success: boolean;
  response: any;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, method: string, endpoint: string, body?: any): Promise<TestResult> {
  try {
    console.log(`\n[TEST] ${name}`);
    console.log(`  ${method} ${endpoint}`);
    
    const url = `${API_BASE}${endpoint}`;
    const options: any = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': TEST_USER_ID,
        'x-dev-bypass': 'true',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
      console.log(`  Body: ${JSON.stringify(body)}`);
    }
    
    const resp = await fetch(url, options);
    const text = await resp.text();
    let response: any;
    try {
      response = JSON.parse(text);
    } catch {
      response = text;
    }
    
    const success = resp.status >= 200 && resp.status < 300;
    const result: TestResult = {
      name,
      endpoint,
      method,
      status: resp.status,
      success,
      response,
    };
    
    console.log(`  Status: ${resp.status}`);
    console.log(`  Response: ${JSON.stringify(response).slice(0, 200)}...`);
    
    results.push(result);
    return result;
  } catch (e: any) {
    const result: TestResult = {
      name,
      endpoint,
      method,
      status: 0,
      success: false,
      response: null,
      error: String(e),
    };
    console.log(`  Error: ${String(e)}`);
    results.push(result);
    return result;
  }
}

async function main() {
  console.log('========================================');
  console.log('  COMPREHENSIVE API FLOW TEST SUITE');
  console.log('========================================');

  // 1. Test member invite flow
  console.log('\n### MEMBER INVITE/REMOVE FLOW ###');
  
  const testEmail = `test-${Date.now()}@victorysync.com`;
  const testUser = {
    email: testEmail,
    password: 'TempPassword123!',
  };
  
  // Simulate creating a member (in real flow, this would come from admin panel)
  await test(
    'Get org members',
    'GET',
    `/api/orgs/${TEST_ORG_ID}/members`
  );

  // 2. Test phone numbers flow
  console.log('\n### PHONE NUMBERS FLOW ###');
  
  await test(
    'List all phone numbers',
    'GET',
    `/api/admin/phone-numbers?unassignedOnly=true`
  );

  await test(
    'Get org phones',
    'GET',
    `/api/admin/orgs/${TEST_ORG_ID}`
  );

  // Get a phone to test with
  const phonesResp = await test(
    'List unassigned phones',
    'GET',
    `/api/admin/mightycall/phone-numbers?unassignedOnly=true`
  );
  
  const phones = (phonesResp.response?.phone_numbers || []) as any[];
  const testPhone = phones.length > 0 ? phones[0] : null;
  
  if (testPhone) {
    console.log(`\nFound test phone: ${testPhone.id} - ${testPhone.number}`);
    
    // Test assigning a phone
    await test(
      'Assign phone to org',
      'POST',
      `/api/admin/orgs/${TEST_ORG_ID}/phone-numbers`,
      { phoneNumberIds: [testPhone.id] }
    );
  } else {
    console.log('\nNo unassigned phones available for testing');
  }

  // 3. Test service-level target flow
  console.log('\n### SERVICE LEVEL TARGET FLOW ###');
  
  await test(
    'Get org settings (service level)',
    'GET',
    `/api/admin/orgs/${TEST_ORG_ID}`
  );

  // Service level would be updated via Supabase client directly (frontend updates it)
  // But we can test the client-metrics endpoint which includes service level context
  await test(
    'Get client metrics (org)',
    'GET',
    `/api/client-metrics?org_id=${TEST_ORG_ID}`
  );

  // 4. Test KPI and dashboard flows
  console.log('\n### DASHBOARD/KPI FLOW ###');
  
  await test(
    'Get recent calls',
    'GET',
    `/api/calls/recent`
  );

  await test(
    'Get call series (day)',
    'GET',
    `/api/calls/series?range=day`
  );

  await test(
    'Get queue summary',
    'GET',
    `/api/calls/queue-summary`
  );

  // 5. Summary
  console.log('\n========================================');
  console.log('  TEST SUMMARY');
  console.log('========================================');
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  
  console.log('\n### DETAILED RESULTS ###');
  results.forEach((r, i) => {
    const icon = r.success ? '✓' : '✗';
    console.log(`${i + 1}. [${icon}] ${r.name} (${r.method} ${r.endpoint})`);
    console.log(`   Status: ${r.status}`);
    if (!r.success && r.error) {
      console.log(`   Error: ${r.error}`);
    }
  });
  
  process.exit(failed > 0 ? 1 : 0);
}

main();
