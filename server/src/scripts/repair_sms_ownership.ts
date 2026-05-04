import { supabaseAdmin } from '../lib/supabaseClient';

function digits(value: any): string {
  return String(value || '').replace(/\D/g, '');
}

function quarantineDedupeKey(row: any, reason: string, detectedNumbers: any[]): string {
  const externalId = String(row.external_id || row.id || '').trim();
  const detected = detectedNumbers.map(digits).filter(Boolean).sort().join(',');
  return ['mightycall_sms_messages', row.org_id || '', externalId || detected, reason].join(':');
}

async function main() {
  const { data: phones, error: phonesError } = await supabaseAdmin
    .from('phone_numbers')
    .select('id, org_id, number, number_digits, e164, phone_number');
  if (phonesError) throw phonesError;

  const phoneByDigits = new Map<string, any[]>();
  for (const phone of phones || []) {
    for (const value of [phone.number_digits, phone.number, phone.e164, phone.phone_number]) {
      const d = digits(value);
      if (!d || d.length < 7) continue;
      const list = phoneByDigits.get(d) || [];
      if (!list.some((item) => item.id === phone.id)) list.push(phone);
      phoneByDigits.set(d, list);
    }
  }

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from('mightycall_sms_messages')
    .select('*')
    .order('created_at', { ascending: false });
  if (rowsError) throw rowsError;

  let repaired = 0;
  let quarantined = 0;
  let unchanged = 0;

  for (const row of rows || []) {
    const candidates = [row.to_number, row.from_number]
      .map((value) => ({ value, digits: digits(value) }))
      .filter((item) => item.digits);
    const matches = candidates.flatMap((item) => phoneByDigits.get(item.digits) || []);
    const uniqueMatches = Array.from(new Map(matches.map((match) => [`${match.org_id}:${match.id}`, match])).values());

    if (uniqueMatches.length === 1) {
      const phone = uniqueMatches[0];
      if (row.org_id !== phone.org_id || row.phone_id !== phone.id) {
        const { error } = await supabaseAdmin
          .from('mightycall_sms_messages')
          .update({
            org_id: phone.org_id,
            phone_id: phone.id,
            metadata: {
              ...(row.metadata || {}),
              ownership_repaired_at: new Date().toISOString(),
              previous_org_id: row.org_id,
              previous_phone_id: row.phone_id,
            },
          })
          .eq('id', row.id);
        if (error) throw error;
        repaired += 1;
      } else {
        unchanged += 1;
      }
      continue;
    }

    if (uniqueMatches.length === 0) {
      const detectedNumbers = candidates.map((item) => item.value);
      await supabaseAdmin.from('integration_quarantine').upsert({
        dedupe_key: quarantineDedupeKey(row, 'repair_owned_number_not_found', detectedNumbers),
        integration_type: 'mightycall_sms_messages',
        source_org_id: row.org_id || null,
        external_id: row.external_id || row.id,
        detected_numbers: detectedNumbers,
        candidate_org_ids: [],
        reason: 'repair_owned_number_not_found',
        raw_payload: row,
      }, { onConflict: 'dedupe_key' });
      quarantined += 1;
      continue;
    }

    const detectedNumbers = candidates.map((item) => item.value);
    await supabaseAdmin.from('integration_quarantine').upsert({
      dedupe_key: quarantineDedupeKey(row, 'repair_ambiguous_number_ownership', detectedNumbers),
      integration_type: 'mightycall_sms_messages',
      source_org_id: row.org_id || null,
      external_id: row.external_id || row.id,
      detected_numbers: detectedNumbers,
      candidate_org_ids: Array.from(new Set(uniqueMatches.map((match) => match.org_id))),
      reason: 'repair_ambiguous_number_ownership',
      raw_payload: row,
    }, { onConflict: 'dedupe_key' });
    quarantined += 1;
  }

  console.log(JSON.stringify({ scanned: rows?.length || 0, repaired, quarantined, unchanged }, null, 2));
}

main().catch((err) => {
  console.error('[repair_sms_ownership] failed:', err);
  process.exit(1);
});
