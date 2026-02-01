const { createClient } = require('@supabase/supabase-js');

async function setup() {
  try {
    const supabase = createClient('https://edsyhtlaqwiicxlzorca.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk');
    
    const testOrgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
    const userId = '9a303c48-2343-4438-832c-7f1268781b6d';
    const phone1Id = 'b2f2cb6d-8099-461d-9896-a892553b0caa';
    const phone2Id = '15a44a46-4605-43ad-8234-fa62f29ec30a';
    
    // Try different role values
    for (const role of ['admin', 'member', 'owner', 'editor']) {
      const { error } = await supabase
        .from('org_users')
        .insert({
          user_id: userId,
          org_id: testOrgId,
          role: role
        });
      
      if (!error) {
        console.log(`✓ Role '${role}' works!`);
        break;
      } else {
        console.log(`✗ Role '${role}': ${error.message}`);
      }
    }
    
    // Now try phone assignment with org_id
    console.log('\n=== Setting up phone assignment ===');
    const { data, error } = await supabase
      .from('user_phone_assignments')
      .insert([
        {
          org_id: testOrgId,
          user_id: userId,
          phone_number_id: phone1Id,
          can_call: true,
          can_receive: true,
          created_at: new Date().toISOString()
        },
        {
          org_id: testOrgId,
          user_id: userId,
          phone_number_id: phone2Id,
          can_call: true,
          can_receive: true,
          created_at: new Date().toISOString()
        }
      ])
      .select();
    
    if (error) {
      console.log('Error:', error);
    } else {
      console.log(`✓ Created ${data?.length || 0} phone assignments`);
      
      console.log(`\n=== Ready to test ===`);
      console.log(`Endpoint: GET /api/call-stats?org_id=${testOrgId}&start_date=2025-01-01&end_date=2025-12-31`);
      console.log(`Header: x-user-id=${userId}`);
      console.log(`User: test124@test.com (non-admin)`);
      console.log(`Assigned phones: +17323286846, +18482161220`);
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
setup();
