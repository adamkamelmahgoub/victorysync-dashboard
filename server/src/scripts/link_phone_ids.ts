import { supabaseAdmin } from '../lib/supabaseClient';

async function linkPhoneIds() {
  // Get all phone numbers and their IDs
  const { data: phones } = await supabaseAdmin
    .from('phone_numbers')
    .select('id, number, org_id')
    .limit(100);

  console.log('[check] Phone numbers:', phones?.length || 0);
  if (phones && phones.length > 0) {
    // Create a map of phone number -> id
    const phoneMap = new Map<string, { id: string; org_id: string }>();
    phones.forEach(p => {
      phoneMap.set(p.number, { id: p.id, org_id: p.org_id });
    });

    console.log('[check] Sample mappings:');
    let count = 0;
    for (const [number, { id, org_id }] of phoneMap) {
      if (count++ < 3) {
        console.log(`  ${number} -> ${id.substring(0, 8)}... (org: ${org_id.substring(0, 8)}...)`);
      }
    }
  }
}

linkPhoneIds().catch(e => console.error('[check] error:', e));
