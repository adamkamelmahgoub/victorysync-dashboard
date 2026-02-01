require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    // Try to query org_users RLS policies
    const { data, error } = await supabase
      .rpc('get_rls_policies', { table_name: 'org_users' });
    
    if (error) {
      console.log('Cannot query RLS policies directly:', error.message);
    } else {
      console.log('RLS Policies:', data);
    }
    
    // Let's check by reading the information_schema
    console.log('\nChecking org_users table structure...');
    const { data: tableInfo, error: tableErr } = await supabase
      .rpc('get_table_info', { table_name: 'org_users' });
    
    if (tableErr) {
      console.log('Cannot query table info:', tableErr.message);
    } else {
      console.log('Table info:', tableInfo);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
