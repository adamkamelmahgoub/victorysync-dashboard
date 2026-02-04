#!/usr/bin/env node
/**
 * Test billing form and API endpoints
 */

const BASE_URL = 'http://localhost:4000';

// Get a platform admin user ID (from test or environment)
const ADMIN_USER_ID = '9a303c48-2343-4438-832c-7f1268781b6d';

async function testBillingEndpoints() {
  console.log('🧪 Testing Billing Endpoints\n');

  try {
    // Test 1: Get existing billing records
    console.log('✓ TEST 1: Fetching existing billing records...');
    let response = await fetch(`${BASE_URL}/api/admin/billing/records`, {
      headers: { 'x-user-id': ADMIN_USER_ID }
    });
    let data = await response.json();
    console.log(`  Status: ${response.status}`);
    if (response.ok) {
      console.log(`  Records count: ${(data.records || []).length}`);
      if (data.records && data.records.length > 0) {
        console.log(`  First record: ${data.records[0].description}`);
      }
    } else {
      console.log(`  Error: ${data.error}`);
    }
    console.log('');

    // Test 2: Create a new billing record
    console.log('✓ TEST 2: Creating a new billing record...');
    response = await fetch(`${BASE_URL}/api/admin/billing/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': ADMIN_USER_ID
      },
      body: JSON.stringify({
        org_id: null,
        user_id: null,
        type: 'subscription',
        description: 'Test billing record - ' + new Date().toISOString(),
        amount: 99.99,
        currency: 'USD'
      })
    });
    data = await response.json();
    console.log(`  Status: ${response.status}`);
    if (response.ok) {
      console.log(`  Created: ${data.record?.id}`);
      console.log(`  Description: ${data.record?.description}`);
      console.log(`  Amount: ${data.record?.currency} ${data.record?.amount}`);
    } else {
      console.log(`  Error: ${data.error}`);
      console.log(`  Detail: ${data.detail}`);
    }
    console.log('');

    // Test 3: Get invoices
    console.log('✓ TEST 3: Fetching invoices...');
    response = await fetch(`${BASE_URL}/api/admin/billing/invoices`, {
      headers: { 'x-user-id': ADMIN_USER_ID }
    });
    data = await response.json();
    console.log(`  Status: ${response.status}`);
    if (response.ok) {
      console.log(`  Invoices count: ${(data.invoices || []).length}`);
      if (data.invoices && data.invoices.length > 0) {
        console.log(`  First invoice: ${data.invoices[0].invoice_number}`);
      }
    } else {
      console.log(`  Error: ${data.error}`);
    }
    console.log('');

    console.log('✅ All billing endpoint tests completed!');
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }
}

testBillingEndpoints().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
