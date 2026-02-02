const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://edsyhtlaqwiicxlzorca.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk', { auth: { persistSession: false } });
(async () => {
  const { data } = await supabase.from('org_phone_numbers').select('*');
  console.log('All org_phone_numbers rows:', data?.length || 0);
  if (data) data.forEach(r => console.log(\  org_id: \... phone: \\));
  process.exit(0);
})();
