const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  'https://bdlsouuybfzrcsgwazjb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkbHNvdXV5YmZ6cmNzZ3dhemp0LnN1cGFiYXNlLmNvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcwMjMyMzAwMCwiZXhwIjoxNzM0MTAwNDAwfQ.uJQ51qhxLxYBLVVR4PvG8QbzkkWTQd5KzKqgSGNpfvI',
  { auth: { persistSession: false } }
);

(async () => {
  const { data, error } = await supabaseAdmin
    .from('org_phone_numbers')
    .select('*')
    .eq('org_id', 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1');
  
  console.log('org_phone_numbers for VictorySync org:');
  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
  process.exit(0);
})();
