const { createClient } = require('@supabase/supabase-js');

async function setup() {
  try {
    const supabase = createClient('https://edsyhtlaqwiicxlzorca.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk');
    
    // Find an org with phone numbers and recordings
    const { data: phones } = await supabase.from('phone_numbers').select('*');
    const { data: recs } = await supabase.from('mightycall_recordings').select('org_id').limit(1);
    const testOrgId = recs?.[0]?.org_id;
    
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const testUser = users?.find(u => u.email === 'test124@test.com');
    
    console.log(`Setting up test: org=${testOrgId}, user=${testUser?.email}`);
    
    if (testUser && testOrgId && phones && phones.length > 2) {
      const phone1 = phones[0];
      const phone2 = phones[1];
      
      // Update phones to org
      const { error: updateError } = await supabase
        .from('phone_numbers')
        .update({ org_id: testOrgId })
        .in('id', [phone1.id, phone2.id]);
      console.log('Phones updated:', !updateError);
      
      // Add org member (using org_users table)
      const { error: memberError } = await supabase
        .from('org_users')
        .insert({
          user_id: testUser.id,
          org_id: testOrgId,
          role: 'manager'  // Use valid enum value
        })
        .select();
      
      console.log('Member added:', !memberError);
      
      // Assign phones (using user_phone_assignments table)
      const { data: assigned, error: assignError } = await supabase
        .from('user_phone_assignments')
        .insert([
          {
            user_id: testUser.id,
            phone_number_id: phone1.id,
            created_at: new Date().toISOString()
          },
          {
            user_id: testUser.id,
            phone_number_id: phone2.id,
            created_at: new Date().toISOString()
          }
        ])
        .select();
      
      console.log('Phones assigned:', assigned?.length || 0);
      
      console.log(`\n=== Test Command ===`);
      console.log(`org_id=${testOrgId}`);
      console.log(`x-user-id=${testUser.id}`);
      console.log(`Phones: ${phone1.number}, ${phone2.number}`);
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
setup();
