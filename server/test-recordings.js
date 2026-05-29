const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://your-project.supabase.co';
const supabaseKey = 'REDACTED_JWT_DO_NOT_USE';
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
