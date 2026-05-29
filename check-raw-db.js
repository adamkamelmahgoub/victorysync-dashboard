const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://your-project.supabase.co';
const supabaseKey = 'REDACTED_JWT_DO_NOT_USE';
const serviceKey = 'REDACTED_JWT_DO_NOT_USE';

async function test() {
  const supabase = createClient(supabaseUrl, serviceKey);
  
  console.log('\n📋 CHECKING MIGHTYCALL_RECORDINGS TABLE DIRECTLY\n');
  
  const { data, error } = await supabase
    .from('mightycall_recordings')
    .select('id,org_id,duration_seconds,duration,recording_date,metadata')
    .limit(5);
    
  if (error) {
    console.error('Error:', error);
    return;
  }

  if (data && data.length > 0) {
    data.forEach((r, i) => {
      console.log(`\nRecording ${i+1}:`);
      console.log(`  duration_seconds: ${r.duration_seconds}`);
      console.log(`  duration: ${r.duration}`);
      console.log(`  recording_date: ${r.recording_date}`);
      if (r.metadata) {
        console.log(`  metadata.duration: ${r.metadata.duration}`);
        console.log(`  metadata.recording_duration: ${r.metadata.recording_duration}`);
      }
    });
  }
}

test().catch(console.error);
