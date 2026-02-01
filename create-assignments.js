const { createClient } = require('@supabase/supabase-js');

async function setup() {
  try {
    const supabase = createClient('https://edsyhtlaqwiicxlzorca.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk');
    
    // Get all org members who are not admins
    const { data: allUsers } = await supabase.from('platform_users').select('id,email,global_role');
    console.log('Users in system:', allUsers?.length || 0);
    
    const nonAdmins = allUsers?.filter(u => u.global_role !== 'platform_admin') || [];
    console.log('Non-admin users:', nonAdmins.length);
    nonAdmins.forEach(u => console.log(`  - ${u.email} (${u.id})`));
    
    // Get phone numbers
    const { data: phones } = await supabase.from('phone_numbers').select('*').limit(4);
    console.log(`\nPhone numbers available: ${phones?.length || 0}`);
    phones?.forEach(p => console.log(`  - ${p.number} (${p.id})`));
    
    if (nonAdmins.length > 0 && phones && phones.length > 0) {
      console.log('\n=== Creating assignments ===');
      
      // Create assignments: distribute phones among non-admin users
      const assignments = nonAdmins.slice(0, 2).map((user, idx) => ({
        client_user_id: user.id,
        phone_number_id: phones[idx % phones.length].id,
        created_at: new Date().toISOString()
      }));
      
      const { data: inserted, error } = await supabase
        .from('phone_number_client_assignments')
        .insert(assignments);
      
      if (error) {
        console.error('Insert error:', error);
      } else {
        console.log(`Inserted ${inserted?.length || 0} assignments`);
        inserted?.forEach((a, i) => {
          console.log(`  ${i+1}. User ${nonAdmins[i].email} -> Phone ${phones[i % phones.length].number}`);
        });
      }
    } else {
      console.log('\nNot enough non-admin users or phones to create assignments');
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
setup();
