const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://edsyhtlaqwiicxlzorca.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk'
);

(async () => {
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .limit(3);

  if (error) {
    console.log('Error:', error);
  } else if (data && data.length > 0) {
    console.log('Call fields:', Object.keys(data[0]));
    console.log('First 3 calls:');
    data.forEach((c, i) => {
      console.log(`  [${i}] from=${c.from_number}, to=${c.to_number}, duration=${c.duration_seconds}`);
    });
  } else {
    console.log('No calls');
  }
})();
