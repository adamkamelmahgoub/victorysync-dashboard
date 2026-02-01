#!/usr/bin/env node

require('dotenv').config({ path: './server/.env' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function addPhoneNumbers() {
  try {
    console.log('[Phone Import] Adding/updating phone numbers in database...');

    // The new phone number the user mentioned
    const phoneNumbers = [
      {
        external_id: 'ny-main-2122357403',
        e164: '+12122357403',
        number: '+12122357403',
        number_digits: '2122357403',
        label: 'New York Main',
        is_active: true
      },
      {
        external_id: 'genx-3123194556',
        e164: '+13123194556',
        number: '+13123194556',
        number_digits: '3123194556',
        label: 'GenX',
        is_active: true
      },
      {
        external_id: 'victorysync2-7323286846',
        e164: '+17323286846',
        number: '+17323286846',
        number_digits: '7323286846',
        label: 'VictorySync 2',
        is_active: true
      },
      {
        external_id: 'victorysync1-8482161220',
        e164: '+18482161220',
        number: '+18482161220',
        number_digits: '8482161220',
        label: 'VictorySync 1',
        is_active: true
      },
      {
        external_id: 'test-8482161220',
        e164: '+18482161220',
        number: '8482161220',
        number_digits: '8482161220',
        label: 'Test',
        is_active: true
      }
    ];

    // First, let's check what's already there
    const { data: existing } = await supabaseAdmin.from('phone_numbers').select('*').order('created_at');
    console.log(`[Phone Import] Found ${existing?.length || 0} existing phone numbers`);

    // Use upsert with onConflict on external_id to avoid duplicates
    const { data, error } = await supabaseAdmin.from('phone_numbers').upsert(phoneNumbers, { onConflict: 'external_id' });

    if (error) {
      console.error('[Phone Import] Error during upsert:', error);
      throw error;
    }

    console.log(`[Phone Import] ✅ Successfully processed ${phoneNumbers.length} phone numbers!`);
    
    // List all phone numbers
    const { data: allNumbers } = await supabaseAdmin.from('phone_numbers').select('*').order('created_at');
    console.log('\n[Phone Import] All phone numbers in database:');
    (allNumbers || []).forEach(p => {
      console.log(`  - ${p.number} (${p.label}) - ${p.is_active ? 'Active' : 'Inactive'}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('[Phone Import ERROR]', err.message);
    process.exit(1);
  }
}

addPhoneNumbers();
