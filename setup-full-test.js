const { createClient } = require('@supabase/supabase-js');

async function setup() {
  try {
    const supabase = createClient('https://edsyhtlaqwiicxlzorca.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk');
    
    // Find an org with phone numbers and recordings
    const { data: phones } = await supabase.from('phone_numbers').select('*');
    console.log('All phones:', phones?.map(p => ({ number: p.number, org_id: p.org_id, id: p.id })));
    
    // Get org with recordings
    const { data: recs } = await supabase.from('mightycall_recordings').select('org_id').limit(1);
    const testOrgId = recs?.[0]?.org_id;
    console.log('\nOrg with recordings:', testOrgId);
    
    // Get a non-admin user
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const nonAdminEmails = ['test124@test.com', 'demo@victorysync.com']; // Pick non-admin users
    const testUser = users?.find(u => nonAdminEmails.includes(u.email));
    console.log(`Test user: ${testUser?.email} (${testUser?.id})`);
    
    if (testUser && testOrgId && phones && phones.length > 0) {
      // Step 1: Ensure phones are assigned to the test org
      console.log('\n=== Setting up test data ===');
      
      // Update phone org_id (if needed)
      const phone1 = phones[0];
      const phone2 = phones[1];
      
      const { error: updateError } = await supabase
        .from('phone_numbers')
        .update({ org_id: testOrgId })
        .in('id', [phone1.id, phone2.id]);
      
      if (updateError) {
        console.log('Update error:', updateError);
      } else {
        console.log(`Updated 2 phones to org ${testOrgId}`);
      }
      
      // Step 2: Create org_users entry so test user is a member
      const { error: memberError } = await supabase
        .from('org_users')
        .insert({
          user_id: testUser.id,
          org_id: testOrgId,
          role: 'user'
        });
      
      if (memberError && memberError.code !== 'PGRST103') { // 23505 = unique violation
        console.log('Member insert error:', memberError);
      } else {
        console.log(`Made ${testUser.email} a member of org ${testOrgId}`);
      }
      
      // Step 3: Assign phones to the test user
      const { error: assignError } = await supabase
        .from('phone_number_client_assignments')
        .insert([
          {
            client_user_id: testUser.id,
            phone_number_id: phone1.id,
            created_at: new Date().toISOString()
          },
          {
            client_user_id: testUser.id,
            phone_number_id: phone2.id,
            created_at: new Date().toISOString()
          }
        ]);
      
      if (assignError && assignError.code !== 'PGRST103') {
        console.log('Assignment insert error:', assignError);
      } else {
        console.log(`Assigned 2 phones to ${testUser.email}`);
      }
      
      console.log('\n=== Test Setup Complete ===');
      console.log(`Test with: org_id=${testOrgId}, x-user-id=${testUser.id}`);
      console.log(`Assigned phones: ${phone1.number}, ${phone2.number}`);
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
setup();
