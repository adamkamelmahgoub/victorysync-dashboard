const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk';
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    console.log('=== Checking data availability ===\n');

    // Check mightycall_reports
    const { count: reportsCount, error: reportsError } = await supabaseAdmin
      .from('mightycall_reports')
      .select('*', { count: 'exact', head: true });
    console.log(`mightycall_reports: ${reportsCount || 0} records (error: ${reportsError?.message || 'none'})`);

    // Check calls table
    const { count: callsCount, error: callsError } = await supabaseAdmin
      .from('calls')
      .select('*', { count: 'exact', head: true });
    console.log(`calls: ${callsCount || 0} records (error: ${callsError?.message || 'none'})`);

    // Check mightycall_recordings
    const { count: recordingsCount, error: recordingsError } = await supabaseAdmin
      .from('mightycall_recordings')
      .select('*', { count: 'exact', head: true });
    console.log(`mightycall_recordings: ${recordingsCount || 0} records (error: ${recordingsError?.message || 'none'})`);

    // Check mightycall_sms_messages
    const { count: smsCount, error: smsError } = await supabaseAdmin
      .from('mightycall_sms_messages')
      .select('*', { count: 'exact', head: true });
    console.log(`mightycall_sms_messages: ${smsCount || 0} records (error: ${smsError?.message || 'none'})`);

    // Check org membership
    console.log('\n=== Sample org data ===');
    const { data: orgs, error: orgsError } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .limit(3);
    console.log('Organizations:', orgs);
  } catch (e) {
    console.error('Exception:', e.message);
  }
})();
