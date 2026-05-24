/**
 * MightyCall API Diagnostic Script
 *
 * Run with: npx ts-node src/scripts/mightycall_diagnostic.ts
 *
 * This script tests each MightyCall API endpoint directly and logs the raw responses.
 * Use this to diagnose why live status, recordings, and SMS aren't working.
 */

import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load env
const envPath = path.resolve(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });
try {
  const raw = fs.readFileSync(envPath, 'utf8');
  const parsed = dotenv.parse(raw);
  if (parsed.MIGHTYCALL_API_KEY) process.env.MIGHTYCALL_API_KEY = parsed.MIGHTYCALL_API_KEY;
  if (parsed.MIGHTYCALL_USER_KEY) process.env.MIGHTYCALL_USER_KEY = parsed.MIGHTYCALL_USER_KEY;
  if (parsed.MIGHTYCALL_BASE_URL) process.env.MIGHTYCALL_BASE_URL = parsed.MIGHTYCALL_BASE_URL;
} catch {}

const BASE = (process.env.MIGHTYCALL_BASE_URL || 'https://ccapi.mightycall.com/v4').replace(/\/$/, '');
const API_KEY = process.env.MIGHTYCALL_API_KEY || '';
const USER_KEY = process.env.MIGHTYCALL_USER_KEY || '';

console.log('=== MightyCall API Diagnostic ===');
console.log(`Base URL: ${BASE}`);
console.log(`API Key: ${API_KEY ? API_KEY.substring(0, 8) + '...' : 'MISSING'}`);
console.log(`User Key: ${USER_KEY ? USER_KEY.substring(0, 8) + '...' : 'MISSING'}`);
console.log('');

async function testAuth(): Promise<string | null> {
  console.log('--- TEST 1: Authentication ---');

  // Try form-encoded (correct for MightyCall)
  const formBody = new URLSearchParams();
  formBody.append('grant_type', 'client_credentials');
  formBody.append('client_id', API_KEY);
  formBody.append('client_secret', USER_KEY);

  const endpoints = ['/auth/token', '/oauth/token', '/token'];

  for (const ep of endpoints) {
    const url = `${BASE}${ep}`;
    console.log(`  Trying: POST ${url}`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
      });
      const text = await res.text();
      console.log(`  Status: ${res.status}`);
      console.log(`  Response: ${text.substring(0, 500)}`);

      if (res.ok) {
        try {
          const json = JSON.parse(text);
          const token = json?.access_token || json?.token;
          if (token) {
            console.log(`  ✅ Got token: ${token.substring(0, 20)}...`);
            return token;
          }
        } catch {}
      }
    } catch (err: any) {
      console.log(`  Error: ${err?.message}`);
    }
  }
  console.log('  ❌ Auth failed\n');
  return null;
}

async function testProfileStatus(token: string) {
  console.log('--- TEST 2: Profile Status ---');
  const endpoints = [
    { url: `${BASE}/profile/status`, params: '' },
    { url: `${BASE}/profile/status`, params: '?extension=100' },
    { url: `${BASE}/status`, params: '' },
  ];

  for (const ep of endpoints) {
    const url = `${ep.url}${ep.params}`;
    console.log(`  Trying: GET ${url}`);
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': API_KEY,
          Accept: 'application/json',
        },
      });
      const text = await res.text();
      console.log(`  Status: ${res.status}`);
      console.log(`  Response: ${text.substring(0, 500)}`);
    } catch (err: any) {
      console.log(`  Error: ${err?.message}`);
    }
  }
  console.log('');
}

async function testLiveCalls(token: string) {
  console.log('--- TEST 3: Live Calls ---');
  const now = new Date();
  const startUtc = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
  const endUtc = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

  const endpoints = [
    { url: `${BASE}/calls`, params: `?startUtc=${startUtc}&endUtc=${endUtc}&pageSize=25` },
    { url: `${BASE}/calls`, params: `?startUtc=${startUtc}&endUtc=${endUtc}&pageSize=25&callFilter=Connected&customFilter=Open` },
    { url: `${BASE}/calls`, params: `?startUtc=${startUtc}&endUtc=${endUtc}&pageSize=25&extension=100` },
    { url: `${BASE}/calls`, params: `?startUtc=${startUtc}&endUtc=${endUtc}&pageSize=25&extension=100&callFilter=Connected&customFilter=Open` },
  ];

  for (const ep of endpoints) {
    const url = `${ep.url}${ep.params}`;
    console.log(`  Trying: GET ${url.substring(0, 120)}...`);
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': API_KEY,
          Accept: 'application/json',
        },
      });
      const text = await res.text();
      console.log(`  Status: ${res.status}`);
      // Try to parse and show call count
      try {
        const json = JSON.parse(text);
        const calls = json?.data?.calls || json?.calls || json?.data || json || [];
        const count = Array.isArray(calls) ? calls.length : 'N/A';
        console.log(`  Calls found: ${count}`);
        if (Array.isArray(calls) && calls.length > 0) {
          console.log(`  First call sample: ${JSON.stringify(calls[0], null, 2).substring(0, 500)}`);
        }
      } catch {
        console.log(`  Response: ${text.substring(0, 300)}`);
      }
    } catch (err: any) {
      console.log(`  Error: ${err?.message}`);
    }
  }
  console.log('');
}

async function testJournal(token: string) {
  console.log('--- TEST 4: Journal (Calls + SMS) ---');
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Test journal for calls
  console.log('  Journal Calls:');
  const callUrl = `${BASE}/journal/requests?type=Call&from=${yesterday}&to=${today}&pageSize=10&page=1`;
  console.log(`    Trying: GET ${callUrl}`);
  try {
    const res = await fetch(callUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': API_KEY,
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    console.log(`    Status: ${res.status}`);
    try {
      const json = JSON.parse(text);
      const requests = json?.requests || json?.data || json || [];
      const count = Array.isArray(requests) ? requests.length : 'N/A';
      console.log(`    Requests found: ${count}`);
      if (Array.isArray(requests) && requests.length > 0) {
        console.log(`    First call sample: ${JSON.stringify(requests[0], null, 2).substring(0, 500)}`);
      }
    } catch {
      console.log(`    Response: ${text.substring(0, 300)}`);
    }
  } catch (err: any) {
    console.log(`    Error: ${err?.message}`);
  }

  // Test journal for SMS
  console.log('  Journal SMS:');
  const smsUrl = `${BASE}/journal/requests?type=Message&from=${yesterday}&to=${today}&pageSize=10&page=1`;
  console.log(`    Trying: GET ${smsUrl}`);
  try {
    const res = await fetch(smsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': API_KEY,
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    console.log(`    Status: ${res.status}`);
    try {
      const json = JSON.parse(text);
      const requests = json?.requests || json?.data || json || [];
      const count = Array.isArray(requests) ? requests.length : 'N/A';
      console.log(`    Messages found: ${count}`);
      if (Array.isArray(requests) && requests.length > 0) {
        console.log(`    First SMS sample: ${JSON.stringify(requests[0], null, 2).substring(0, 500)}`);
        // Check direction field specifically
        const first = requests[0];
        console.log(`    Direction field: "${first?.direction}"`);
        console.log(`    All direction-related fields:`, {
          direction: first?.direction,
          messageDirection: first?.messageDirection,
          origin: first?.origin,
          type: first?.type,
          messageInfo: first?.messageInfo,
        });
      }
    } catch {
      console.log(`    Response: ${text.substring(0, 300)}`);
    }
  } catch (err: any) {
    console.log(`    Error: ${err?.message}`);
  }
  console.log('');
}

async function testPhoneNumbers(token: string) {
  console.log('--- TEST 5: Phone Numbers ---');
  const endpoints = [
    `${BASE}/api/phonenumbers`,
    `${BASE}/phonenumbers`,
    `${BASE}/phone_numbers`,
  ];

  for (const url of endpoints) {
    console.log(`  Trying: GET ${url}`);
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': API_KEY,
          Accept: 'application/json',
        },
      });
      const text = await res.text();
      console.log(`  Status: ${res.status}`);
      try {
        const json = JSON.parse(text);
        const phones = json?.data?.phoneNumbers || json?.data || json?.phoneNumbers || json || [];
        const count = Array.isArray(phones) ? phones.length : 'N/A';
        console.log(`  Phone numbers found: ${count}`);
        if (Array.isArray(phones) && phones.length > 0) {
          console.log(`  First phone: ${JSON.stringify(phones[0], null, 2).substring(0, 300)}`);
        }
      } catch {
        console.log(`  Response: ${text.substring(0, 300)}`);
      }
    } catch (err: any) {
      console.log(`  Error: ${err?.message}`);
    }
  }
  console.log('');
}

async function testExtensions(token: string) {
  console.log('--- TEST 6: Extensions / Users ---');
  const endpoints = [
    `${BASE}/extensions`,
    `${BASE}/users`,
    `${BASE}/agents`,
    `${BASE}/v4/extensions`,
    `${BASE}/v4/users`,
  ];

  for (const url of endpoints) {
    console.log(`  Trying: GET ${url}`);
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': API_KEY,
          Accept: 'application/json',
        },
      });
      const text = await res.text();
      console.log(`  Status: ${res.status}`);
      try {
        const json = JSON.parse(text);
        const items = json?.data?.extensions || json?.extensions || json?.data?.users || json?.users || json?.data || json || [];
        const count = Array.isArray(items) ? items.length : 'N/A';
        console.log(`  Items found: ${count}`);
        if (Array.isArray(items) && items.length > 0) {
          console.log(`  First item: ${JSON.stringify(items[0], null, 2).substring(0, 300)}`);
        }
      } catch {
        console.log(`  Response: ${text.substring(0, 300)}`);
      }
    } catch (err: any) {
      console.log(`  Error: ${err?.message}`);
    }
  }
  console.log('');
}

async function main() {
  console.log('Starting MightyCall API diagnostic...\n');

  // Step 1: Auth
  const token = await testAuth();
  if (!token) {
    console.log('❌ Cannot proceed without auth token. Check your MIGHTYCALL_API_KEY and MIGHTYCALL_USER_KEY.');
    return;
  }

  // Step 2: Profile status
  await testProfileStatus(token);

  // Step 3: Live calls
  await testLiveCalls(token);

  // Step 4: Journal (calls + SMS)
  await testJournal(token);

  // Step 5: Phone numbers
  await testPhoneNumbers(token);

  // Step 6: Extensions
  await testExtensions(token);

  console.log('=== Diagnostic Complete ===');
  console.log('Review the output above to see:');
  console.log('1. Which auth method works');
  console.log('2. What profile/status endpoints return');
  console.log('3. What call data the /calls endpoint returns');
  console.log('4. What SMS data the /journal/requests endpoint returns');
  console.log('5. What phone numbers are available');
  console.log('6. What extensions/users are available');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
