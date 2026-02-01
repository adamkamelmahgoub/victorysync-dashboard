const { createClient } = require('@supabase/supabase-js');

async function setup() {
  try {
    const supabase = createClient('https://edsyhtlaqwiicxlzorca.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk');
    
    // Get first org
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
    const orgId = orgs?.[0]?.id;
    console.log('Using org:', orgId);
    
    // Get phone numbers for this org
    const { data: phones } = await supabase
      .from('phone_numbers')
      .select('id,number')
      .eq('org_id', orgId)
      .limit(2);
    
    console.log('Available phones:', phones);
    
    if (phones && phones.length > 0) {
      // Check if there's a non-admin user in this org
      const { data: members } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', orgId)
        .limit(10);
      
      console.log('\nOrg members:', members?.length || 0);
      
      if (members && members.length > 0) {
        const userId = members[0].user_id;
        console.log(`Using user: ${userId}`);
        
        // Check if this user already has assignments
        const { data: existing } = await supabase
          .from('phone_number_client_assignments')
          .select('*')
          .eq('client_user_id', userId);
        
        console.log(`Existing assignments for user: ${existing?.length || 0}`);
        
        // Create assignment if it doesn't exist
        if (!existing || existing.length === 0) {
          const { data: inserted, error } = await supabase
            .from('phone_number_client_assignments')
            .insert({
              client_user_id: userId,
              phone_number_id: phones[0].id,
              created_at: new Date().toISOString()
            });
          
          if (error) {
            console.error('Insert error:', error);
          } else {
            console.log('\nAssignment created successfully!');
            console.log(`User ${userId} assigned to phone ${phones[0].number}`);
          }
        }
      }
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
setup();
