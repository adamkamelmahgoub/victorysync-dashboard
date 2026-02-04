const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk'
);

(async () => {
  const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

  // Check calls table
  const { data: calls, count: callCount } = await supabase
    .from('calls')
    .select('id, duration_seconds, status, started_at', { count: 'exact' })
    .eq('org_id', ORG)
    .limit(3);

  console.log('Calls table:');
  console.log('  Count:', callCount);
  console.log('  Sample:');
  (calls || []).forEach(c => {
    console.log(`    duration_seconds: ${c.duration_seconds}, status: ${c.status}`);
  });

  // Check recordings
  const { data: recs, count: recCount } = await supabase
    .from('mightycall_recordings')
    .select('id, duration_seconds', { count: 'exact' })
    .eq('org_id', ORG)
    .limit(3);

  console.log('\nRecordings table:');
  console.log('  Count:', recCount);
  console.log('  Sample:');
  (recs || []).forEach(r => {
    console.log(`    duration_seconds: ${r.duration_seconds}`);
  });

  process.exit(0);
})();
