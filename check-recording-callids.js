const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk'
);

(async () => {
  const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

  console.log('Checking recordings and their call_id...');
  const { data: recordings } = await supabase
    .from('mightycall_recordings')
    .select('id, call_id, org_id, recording_date')
    .eq('org_id', ORG)
    .limit(5);

  console.log('Recordings:', recordings?.length || 0);
  if (recordings) {
    recordings.forEach(r => {
      console.log(`  ${r.id.slice(0, 8)}... call_id: ${r.call_id || 'NULL'}`);
    });
  }

  if (recordings && recordings[0] && recordings[0].call_id) {
    const callId = recordings[0].call_id;
    console.log(`\nLooking up call ${callId}...`);
    const { data: call } = await supabase
      .from('calls')
      .select('id, from_number, to_number, duration_seconds')
      .eq('id', callId);
    
    console.log('Call found:', call?.length || 0);
    if (call && call[0]) {
      console.log(call[0]);
    }
  }

  process.exit(0);
})();
