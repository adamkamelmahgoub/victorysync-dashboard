const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk',
  { auth: { persistSession: false } }
);

(async () => {
  try {
    const { data: allRows, error: err } = await supabaseAdmin
      .from('org_phone_numbers')
      .select('*');
    
    if (err) {
      console.log('Error:', err.message);
    } else {
      console.log(`Total org_phone_numbers rows: ${allRows.length}`);
      console.log('\nAll rows:');
      allRows.forEach((row, i) => {
        console.log(`[${i}]:`, JSON.stringify(row, null, 2));
      });
      
      // Filter for our test org
      const testOrg = allRows.filter(r => r.org_id === 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1');
      console.log(`\nRows for VictorySync org (cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1): ${testOrg.length}`);
      testOrg.forEach(row => {
        console.log('  -', JSON.stringify(row));
      });
    }
  } catch(e) {
    console.log('Exception:', e.message);
  }
  process.exit(0);
})();
