const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE',
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
