const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk',
  { auth: { persistSession: false } }
);
(async () => {
  const orgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
  const { data, error } = await supabase
    .from('org_phone_numbers')
    .select('*')
    .eq('org_id', orgId);
  console.log('Rows for VictorySync:', data?.length || 0);
  if (data && data.length > 0) console.log(JSON.stringify(data, null, 2));
  process.exit(0);
})();
