const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTA1OTI3OTgsImV4cCI6MTcwNTIxMjc5OH0.dNBa0tFlDVhZNVgWWPWP3w8Fg8RN9v3tpNRPGcxYMfA';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY4OTU5Mjc5OCwiZXhwIjoyMDA1MTUyNzk4fQ.M3ydD7jXGhHsJW2YaVRLPM-SoozNAY9p4K_JhM2hJVo';

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
