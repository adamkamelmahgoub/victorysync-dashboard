const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE',
  { auth: { persistSession: false } }
);
(async () => {
  const { data, error } = await supabase.rpc('get_table_schema', { table_name: 'org_phone_numbers' }).catch(() => ({ data: null, error: { message: 'RPC not available' } }));
  if (error) {
    console.log('Schema RPC not available, querying info schema...');
    const { data: cols, error: colErr } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'org_phone_numbers');
    console.log('Columns:', cols);
  } else {
    console.log('Schema:', data);
  }
  process.exit(0);
})();
