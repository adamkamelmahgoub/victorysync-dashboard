#!/usr/bin/env node

require('dotenv').config({ path: './server/.env' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function listPhones() {
  try {
    console.log('[List] Fetching all phone numbers...');

    const { data, error } = await supabaseAdmin.from('phone_numbers').select('*').order('created_at');

    if (error) {
      throw error;
    }

    console.log(`\n✅ Found ${data?.length || 0} phone numbers:\n`);
    (data || []).forEach(p => {
      console.log(`  ID: ${p.id}`);
      console.log(`  Number: ${p.number}`);
      console.log(`  E164: ${p.e164}`);
      console.log(`  Label: ${p.label}`);
      console.log(`  Active: ${p.is_active}`);
      console.log(`  External ID: ${p.external_id}`);
      console.log();
    });

    // Check if the new phone number exists
    const newPhoneNumber = '2122357403';
    const exists = (data || []).some(p => p.number_digits === newPhoneNumber || p.number.includes(newPhoneNumber));
    
    if (!exists) {
      console.log(`\n⚠️  New phone number (+1${newPhoneNumber}) is NOT in database yet`);
      console.log('Adding it now...');
      
      const { error: insertError } = await supabaseAdmin.from('phone_numbers').insert({
        external_id: 'ny-main-' + newPhoneNumber,
        e164: '+1' + newPhoneNumber,
        number: '+1' + newPhoneNumber,
        number_digits: newPhoneNumber,
        label: 'New York Main',
        is_active: true
      });

      if (insertError) {
        throw insertError;
      }

      console.log(`✅ Added +1${newPhoneNumber} to database!`);
    } else {
      console.log(`\n✅ New phone number (+1${newPhoneNumber}) is already in database`);
    }

    process.exit(0);
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  }
}

listPhones();
