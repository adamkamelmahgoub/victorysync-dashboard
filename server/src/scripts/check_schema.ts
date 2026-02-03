import { supabaseAdmin } from '../lib/supabaseClient';

async function checkSchema() {
  // Check mightycall_reports table schema
  const { data, error } = await supabaseAdmin
    .from('mightycall_reports')
    .select('*')
    .limit(1);

  console.log('[check] mightycall_reports query result:', error || 'OK');

  // Query the information_schema directly
  let columns: any = null;
  let columnsError: any = null;
  try {
    const res = await supabaseAdmin.rpc('get_table_schema', { table_name: 'mightycall_reports' });
    columns = (res as any).data ?? null;
    columnsError = (res as any).error ?? null;
  } catch (e) {
    columns = null;
    columnsError = 'rpc not available';
  }

  if (columnsError || !columns) {
    console.log('[check] Could not get schema via RPC, trying direct query...');
    
    // Try raw SQL if available
    let tableInfo: any = null;
    try {
      const r = await supabaseAdmin
        .from('information_schema.tables')
        .select('*')
        .eq('table_name', 'mightycall_reports');
      tableInfo = (r as any).data ?? null;
    } catch (e) {
      tableInfo = null;
    }

    console.log('[check] Table info:', tableInfo);
  } else {
    console.log('[check] Columns:', columns);
  }

  // Query constraints
  const { data: constraints } = await supabaseAdmin
    .from('information_schema.constraint_column_usage')
    .select('*')
    .eq('table_name', 'mightycall_reports')
    // .catch removed: use try/catch above

  console.log('[check] Constraints:', constraints);
}

checkSchema().catch(e => console.error('[check] error:', e));
