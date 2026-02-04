const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk';
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    // Get a sample recording
    const { data: recs, error } = await supabaseAdmin
      .from('mightycall_recordings')
      .select('*')
      .limit(1);
    
    if (recs && recs.length > 0) {
      console.log('Sample Recording:');
      console.log(JSON.stringify(recs[0], null, 2));
    } else {
      console.log('No recordings found');
    }
    console.log('Error:', error);
  } catch (e) {
    console.error('Exception:', e.message);
  }
})();
