const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://your-project.supabase.co',
  'REDACTED_JWT_DO_NOT_USE'
);

(async () => {
  const ORG = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';

  // Get a recording with its full data
  const { data: recording } = await supabase
    .from('mightycall_recordings')
    .select('*')
    .eq('org_id', ORG)
    .limit(1)
    .single();

  if (recording) {
    console.log('Recording structure:');
    console.log(JSON.stringify(recording, null, 2));
  }

  // Check if recording table has any phone number columns
  const { data: recordingWithAllColumns } = await supabase
    .from('mightycall_recordings')
    .select('*')
    .eq('org_id', ORG)
    .limit(1);

  if (recordingWithAllColumns && recordingWithAllColumns[0]) {
    console.log('\nColumn names in mightycall_recordings:');
    console.log(Object.keys(recordingWithAllColumns[0]));
  }

  process.exit(0);
})();
