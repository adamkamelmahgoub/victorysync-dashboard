import { supabaseAdmin } from '../lib/supabaseClient';

async function checkSchema() {
  // Check mightycall_reports table schema
  const { data, error } = await supabaseAdmin
    .from('mightycall_reports')
    .select('*')
    .limit(1);

  console.log('[check] mightycall_reports query result:', error || 'OK');

  // Query the information_schema directly
  const { data: columns, error: columnsError } = await supabaseAdmin.rpc('get_table_schema', { table_name: 'mightycall_reports' }).catch(() => ({ data: null, error: 'rpc not available' }));

  if (columnsError || !columns) {
    console.log('[check] Could not get schema via RPC, trying direct query...');
    
    // Try raw SQL if available
    const { data: tableInfo } = await supabaseAdmin
      .from('information_schema.tables')
      .select('*')
      .eq('table_name', 'mightycall_reports')
      .catch(() => ({ data: null }));

    console.log('[check] Table info:', tableInfo);
  } else {
    console.log('[check] Columns:', columns);
  }

  // Query constraints
  const { data: constraints } = await supabaseAdmin
    .from('information_schema.constraint_column_usage')
    .select('*')
    .eq('table_name', 'mightycall_reports')
    .catch(() => ({ data: null }));

  console.log('[check] Constraints:', constraints);
}

checkSchema().catch(e => console.error('[check] error:', e));
