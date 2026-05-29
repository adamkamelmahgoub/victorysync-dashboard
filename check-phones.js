const { createClient } = require('@supabase/supabase-js');

async function check() {
  try {
    const supabase = createClient('https://your-project.supabase.co', 'REDACTED_JWT_DO_NOT_USE');
    
    // Get all phone numbers with their orgs
    const { data: phones } = await supabase.from('phone_numbers').select('id,number,org_id');
    console.log(`Total phone numbers: ${phones?.length || 0}`);
    
    const byOrg = {};
    phones?.forEach(p => {
      if (!byOrg[p.org_id]) byOrg[p.org_id] = [];
      byOrg[p.org_id].push(p.number);
    });
    
    console.log('\nOrgs with phones:');
    for (const [orgId, numbers] of Object.entries(byOrg)) {
      const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).single();
      console.log(`  ${org?.name} (${orgId}): ${numbers.join(', ')}`);
    }
    
    // Get all recordings to see which org has data
    const { data: recs, error } = await supabase.from('mightycall_recordings').select('org_id,count()').eq('org_id', Object.keys(byOrg)[0]).limit(1);
    console.log('\nRecordings count error:', error);
    
    const { count: totalRecs } = await supabase.from('mightycall_recordings').select('*', { count: 'exact', head: true });
    console.log(`Total recordings: ${totalRecs || 0}`);
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
check();
