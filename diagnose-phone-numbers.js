const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'REDACTED_JWT_DO_NOT_USE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('🔍 Diagnosing phone number issues...\n');

  try {
    // 1. Check mightycall_recordings table structure and sample data
    console.log('1️⃣  Checking mightycall_recordings table...');
    const { data: recordings, error: recErr } = await supabase
      .from('mightycall_recordings')
      .select('*')
      .limit(5);

    if (recErr) {
      console.error('   ❌ Error fetching recordings:', recErr.message);
    } else {
      console.log(`   ✅ Found ${recordings?.length} sample recordings`);
      if (recordings && recordings.length > 0) {
        const rec = recordings[0];
        console.log('   Sample recording fields:', Object.keys(rec));
        console.log('   Sample data:');
        console.log(`     - call_id: ${rec.call_id}`);
        console.log(`     - from_number: ${rec.from_number}`);
        console.log(`     - to_number: ${rec.to_number}`);
        console.log(`     - duration_seconds: ${rec.duration_seconds}`);
        console.log(`     - metadata: ${JSON.stringify(rec.metadata).substring(0, 100)}...`);
      }
    }

    // 2. Check calls table structure
    console.log('\n2️⃣  Checking calls table...');
    const { data: calls, error: callErr } = await supabase
      .from('calls')
      .select('id, from_number, to_number, duration_seconds, started_at')
      .limit(5);

    if (callErr) {
      console.error('   ❌ Error fetching calls:', callErr.message);
    } else {
      console.log(`   ✅ Found ${calls?.length} sample calls`);
      if (calls && calls.length > 0) {
        const call = calls[0];
        console.log('   Sample call:');
        console.log(`     - id: ${call.id}`);
        console.log(`     - from_number: ${call.from_number}`);
        console.log(`     - to_number: ${call.to_number}`);
        console.log(`     - duration_seconds: ${call.duration_seconds}`);
      }
    }

    // 3. Check if there are matching call_id values
    console.log('\n3️⃣  Checking call_id relationships...');
    const { data: recsWithCallIds, error: relErr } = await supabase
      .from('mightycall_recordings')
      .select('id, call_id, from_number, to_number')
      .not('call_id', 'is', null)
      .limit(10);

    if (relErr) {
      console.error('   ❌ Error:', relErr.message);
    } else {
      const validCallIds = recsWithCallIds?.filter(r => r.call_id) || [];
      console.log(`   ✅ Found ${validCallIds.length} recordings with call_id references`);

      if (validCallIds.length > 0) {
        // Try to find matching calls
        const callIds = validCallIds.map(r => r.call_id).slice(0, 5);
        const { data: matchingCalls, error: matchErr } = await supabase
          .from('calls')
          .select('id, from_number, to_number')
          .in('id', callIds);

        if (matchErr) {
          console.error('   ⚠️  Could not find matching calls:', matchErr.message);
        } else {
          console.log(`   ✅ Found ${matchingCalls?.length || 0} matching calls in calls table`);
          console.log('\n   Comparison:');
          validCallIds.slice(0, 3).forEach(rec => {
            const matching = matchingCalls?.find(c => c.id === rec.call_id);
            console.log(`     Recording call_id=${rec.call_id}:`);
            console.log(`       - In mightycall_recordings: from=${rec.from_number}, to=${rec.to_number}`);
            console.log(`       - In calls table: from=${matching?.from_number || '(not found)'}, to=${matching?.to_number || '(not found)'}`);
          });
        }
      }
    }

    // 4. Check for NULL phone numbers
    console.log('\n4️⃣  Checking for NULL phone numbers...');
    const { data: nullPhones, error: nullErr, count: nullCount } = await supabase
      .from('mightycall_recordings')
      .select('id', { count: 'exact' })
      .or('from_number.is.null,to_number.is.null');

    if (nullErr) {
      console.error('   ❌ Error:', nullErr.message);
    } else {
      console.log(`   📊 Recordings with NULL phone numbers: ${nullCount || 0}`);
    }

    // 5. Check calls table for NULL phone numbers
    console.log('\n5️⃣  Checking calls table for NULL phone numbers...');
    const { data: nullCalls, error: nullCallErr, count: nullCallCount } = await supabase
      .from('calls')
      .select('id', { count: 'exact' })
      .or('from_number.is.null,to_number.is.null');

    if (nullCallErr) {
      console.error('   ❌ Error:', nullCallErr.message);
    } else {
      console.log(`   📊 Calls with NULL phone numbers: ${nullCallCount || 0}`);
    }

    // 6. Get total counts
    console.log('\n6️⃣  Total record counts...');
    const { count: totalRecs } = await supabase
      .from('mightycall_recordings')
      .select('id', { count: 'exact' });

    const { count: totalCalls } = await supabase
      .from('calls')
      .select('id', { count: 'exact' });

    console.log(`   📊 Total mightycall_recordings: ${totalRecs}`);
    console.log(`   📊 Total calls: ${totalCalls}`);

    console.log('\n✨ Diagnosis complete!');
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

diagnose();
