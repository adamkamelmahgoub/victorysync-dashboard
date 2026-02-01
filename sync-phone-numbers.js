#!/usr/bin/env node

require('dotenv').config({ path: './server/.env' });

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MIGHTYCALL_API_KEY = process.env.MIGHTYCALL_API_KEY;
const MIGHTYCALL_USER_KEY = process.env.MIGHTYCALL_USER_KEY;
const MIGHTYCALL_BASE_URL = process.env.MIGHTYCALL_BASE_URL || 'https://ccapi.mightycall.com/v4';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getMightyCallAccessToken() {
  const url = `${MIGHTYCALL_BASE_URL}/auth/token`;
  
  const formData = new URLSearchParams();
  formData.append('grant_type', 'client_credentials');
  formData.append('client_id', MIGHTYCALL_API_KEY);
  formData.append('client_secret', MIGHTYCALL_USER_KEY);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to obtain token: ${text}`);
  }

  const json = JSON.parse(text);
  return json.access_token;
}

async function fetchMightyCallPhoneNumbers(token) {
  const baseUrl = MIGHTYCALL_BASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}/phonenumbers`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': MIGHTYCALL_API_KEY,
      Accept: 'application/json',
    },
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('Failed to fetch phonenumbers:', res.status, text);
    return [];
  }

  const json = JSON.parse(text);
  const list = json?.data?.phoneNumbers ?? [];
  
  return list.map((n) => {
    const externalId = String(n.objectGuid ?? n.id ?? n.phoneNumberId ?? n.phoneNumber);
    const phoneNumber = n.number ?? n.phoneNumber ?? '';
    const e164Val = n.e164 ?? phoneNumber;
    const digits = (phoneNumber || e164Val || '').replace(/\D/g, '');

    return {
      externalId,
      e164: e164Val,
      number: phoneNumber,
      numberDigits: digits,
      label: n.label ?? n.description ?? null,
      isActive: n.isEnabled ?? (n.subscriptionState === 'subscribed' || n.subscriptionState === 'active'),
    };
  });
}

async function syncPhoneNumbers(numbers) {
  const rows = numbers.map(n => ({
    external_id: n.externalId,
    e164: n.e164,
    number: n.number,
    number_digits: n.numberDigits,
    label: n.label,
    is_active: n.isActive
  }));

  const { data, error } = await supabaseAdmin.from('phone_numbers').upsert(rows, { onConflict: 'external_id' });
  
  if (error) {
    throw error;
  }

  return data ? data.length : rows.length;
}

async function main() {
  try {
    console.log('[Sync] Getting MightyCall access token...');
    const token = await getMightyCallAccessToken();
    console.log('[Sync] Token obtained');

    console.log('[Sync] Fetching phone numbers from MightyCall...');
    const numbers = await fetchMightyCallPhoneNumbers(token);
    console.log(`[Sync] Found ${numbers.length} phone numbers:`);
    numbers.forEach(n => {
      console.log(`  - ${n.number} (${n.label || 'N/A'})`);
    });

    console.log('[Sync] Syncing phone numbers to database...');
    const upserted = await syncPhoneNumbers(numbers);
    console.log(`[Sync] Successfully synced ${upserted} phone numbers!`);

    console.log('\n✅ SYNC COMPLETE');
    process.exit(0);
  } catch (err) {
    console.error('[Sync ERROR]', err.message);
    process.exit(1);
  }
}

main();
