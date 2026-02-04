const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk'
);

(async () => {
  console.log('Looking for phone numbers...');
  
  // Check all phone numbers
  const { data: allPhones } = await supabase
    .from('phone_numbers')
    .select('id, number, org_id')
    .limit(5);
  
  console.log('\nAll phone_numbers records:', allPhones?.length || 0);
  if (allPhones) {
    allPhones.forEach(p => console.log(`  ${p.number} -> org: ${p.org_id.slice(0, 8)}...`));
  }

  // Check recordings and their org_id
  const { data: recs } = await supabase
    .from('mightycall_recordings')
    .select('id, org_id')
    .limit(3);
  
  console.log('\nRecordings by org_id:');
  const orgIds = new Set();
  (recs || []).forEach(r => {
    orgIds.add(r.org_id);
    console.log(`  Recording org: ${r.org_id.slice(0, 8)}...`);
  });

  // Check calls
  const { data: calls } = await supabase
    .from('calls')
    .select('id, org_id, from_number, to_number')
    .limit(3);
  
  console.log('\nCalls:');
  (calls || []).forEach(c => {
    console.log(`  ${c.from_number} -> ${c.to_number}, org: ${c.org_id.slice(0, 8)}...`);
  });

  process.exit(0);
})();
