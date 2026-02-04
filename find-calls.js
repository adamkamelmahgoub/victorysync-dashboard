const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk'
);

(async () => {
  const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

  // Look for ANY records in calls table
  const { data: allCalls } = await supabase
    .from('calls')
    .select('id, org_id, from_number, to_number')
    .eq('org_id', ORG)
    .limit(5);

  console.log('Calls in this org:', allCalls?.length || 0);
  if (allCalls) {
    allCalls.forEach(c => {
      console.log(`  ${c.id.slice(0, 8)}... ${c.from_number} -> ${c.to_number}`);
    });
  }

  // Check total call count
  const { count } = await supabase
    .from('calls')
    .select('*', { count: 'exact' })
    .eq('org_id', ORG);
  
  console.log('\nTotal calls in org:', count || 0);

  // Check all tables that might have call data
  console.log('\nLooking in mightycall_calls table...');
  const { data: mcCalls } = await supabase
    .from('mightycall_calls')
    .select('id, org_id, from_number')
    .eq('org_id', ORG)
    .limit(3);
  
  console.log('mightycall_calls found:', mcCalls?.length || 0);

  process.exit(0);
})();
