#!/usr/bin/env node
/**
 * Apply the billing/packages/reporting migration
 * Run this script to create the necessary database tables
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://your-project.supabase.co';
const SERVICE_KEY = 'REDACTED_JWT_DO_NOT_USE';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function applyMigration() {
  console.log('🚀 Applying billing/packages/reporting migration...');

  try {
    const migrationPath = path.join(__dirname, 'supabase', '010_add_billing_packages_and_reporting.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded, executing SQL...');

    // Since we can't execute DDL directly, we'll provide instructions
    console.log('⚠️  Note: This script cannot execute DDL statements via the Supabase client.');
    console.log('📋 To apply this migration:');
    console.log('1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/edsyhtlaqwiicxlzorca');
    console.log('2. Navigate to the SQL Editor');
    console.log('3. Copy and paste the contents of supabase/010_add_billing_packages_and_reporting.sql');
    console.log('4. Execute the SQL');

    console.log('✅ Migration ready. The SQL file contains:');
    console.log('- packages table (platform-wide and user packages)');
    console.log('- user_packages table (package assignments)');
    console.log('- billing_records table (billing history)');
    console.log('- invoices and invoice_items tables');
    console.log('- mightycall_reports and mightycall_recordings tables');
    console.log('- RLS policies for all tables');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

if (require.main === module) {
  applyMigration();
}

module.exports = { applyMigration };