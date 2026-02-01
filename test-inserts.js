const { createClient } = require('@supabase/supabase-js');

async function setup() {
  try {
    const supabase = createClient('https://edsyhtlaqwiicxlzorca.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk');
    
    const testOrgId = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
    const userId = '9a303c48-2343-4438-832c-7f1268781b6d';
    const phone1Id = 'b2f2cb6d-8099-461d-9896-a892553b0caa';
    const phone2Id = '15a44a46-4605-43ad-8234-fa62f29ec30a';
    
    // Try adding org member
    console.log('=== Trying org_users insert ===');
    const { data, error } = await supabase
      .from('org_users')
      .insert({
        user_id: userId,
        org_id: testOrgId,
        role: 'manager'
      })
      .select();
    
    console.log('Error:', error);
    console.log('Data:', data);
    
    // Try user_phone_assignments
    console.log('\n=== Trying user_phone_assignments insert ===');
    const { data: data2, error: error2 } = await supabase
      .from('user_phone_assignments')
      .insert({
        user_id: userId,
        phone_number_id: phone1Id,
        created_at: new Date().toISOString()
      })
      .select();
    
    console.log('Error:', error2);
    console.log('Data:', data2);
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
setup();
