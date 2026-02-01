const { createClient } = require('@supabase/supabase-js');

async function check() {
  try {
    const supabase = createClient('https://edsyhtlaqwiicxlzorca.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk');
    
    // Check phone_number_client_assignments columns
    const { data: assignments } = await supabase.from('phone_number_client_assignments').select('*').limit(1);
    console.log('Sample assignment:', assignments?.[0]);
    
    // Check recordings
    const { data: recs } = await supabase.from('mightycall_recordings').select('*').limit(1);
    console.log('\nSample recording:', recs?.[0]);
    
    // Check phone numbers structure
    const { data: phones } = await supabase.from('phone_numbers').select('*').limit(1);
    console.log('\nSample phone:', phones?.[0]);
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}
check();
