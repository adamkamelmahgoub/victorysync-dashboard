const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk',
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
