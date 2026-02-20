import '../config/env';
import { getSupabaseAdminClient } from '../lib/supabaseClient';
import { normalizePhoneDigits } from '../lib/phoneUtils';

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) throw new Error('email required');
  const supabase = getSupabaseAdminClient();

  const { data: users, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  const user = (users?.users || []).find((u: any) => String(u.email || '').toLowerCase() === email);
  if (!user) throw new Error(`user_not_found:${email}`);

  console.log('user', { id: user.id, email: user.email, metadata: user.user_metadata });

  const [ou, om, olm] = await Promise.all([
    supabase.from('org_users').select('org_id, role').eq('user_id', user.id),
    supabase.from('org_members').select('org_id, role').eq('user_id', user.id),
    supabase.from('organization_members').select('org_id, role').eq('user_id', user.id),
  ]);

  console.log('org_users', ou.data || [], ou.error?.message || null);
  console.log('org_members', om.data || [], om.error?.message || null);
  console.log('organization_members', olm.data || [], olm.error?.message || null);

  const orgIds = Array.from(new Set([
    ...((ou.data || []).map((r: any) => r.org_id)),
    ...((om.data || []).map((r: any) => r.org_id)),
    ...((olm.data || []).map((r: any) => r.org_id)),
    String((user.user_metadata as any)?.org_id || '').trim() || null
  ].filter(Boolean)));

  console.log('resolved_org_ids', orgIds);

  for (const orgId of orgIds) {
    console.log(`\n--- org ${orgId} ---`);
    const { data: assignments } = await supabase
      .from('user_phone_assignments')
      .select('phone_number_id, created_at')
      .eq('org_id', orgId)
      .eq('user_id', user.id);
    console.log('user_phone_assignments', assignments || []);

    const ids = (assignments || []).map((a: any) => a.phone_number_id).filter(Boolean);
    let phones: any[] = [];
    if (ids.length > 0) {
      const { data: p } = await supabase.from('phone_numbers').select('id, number, number_digits, label').in('id', ids);
      phones = p || [];
    }
    console.log('assigned_phone_rows', phones);

    const numbers = phones.map((p: any) => String(p.number || '').trim()).filter(Boolean);
    const digits = phones.map((p: any) => String(p.number_digits || normalizePhoneDigits(p.number) || '')).filter(Boolean);
    console.log('assigned_numbers', numbers);
    console.log('assigned_digits', digits);

    if (numbers.length === 0 && digits.length === 0) {
      console.log('no assigned numbers in this org');
      continue;
    }

    let cq = supabase.from('calls').select('id, from_number, to_number, from_number_digits, to_number_digits, status, started_at').eq('org_id', orgId).order('started_at', { ascending: false }).limit(50);
    const orParts: string[] = [];
    for (const n of numbers) {
      orParts.push(`from_number.eq.${n}`);
      orParts.push(`to_number.eq.${n}`);
    }
    for (const d of digits) {
      orParts.push(`from_number_digits.eq.${d}`);
      orParts.push(`to_number_digits.eq.${d}`);
    }
    if (orParts.length > 0) cq = cq.or(orParts.join(','));
    const { data: calls, error: cErr } = await cq;
    console.log('matching_calls_count', (calls || []).length, cErr?.message || null);

    let rq = supabase.from('mightycall_recordings').select('id, from_number, to_number, recording_date, duration_seconds').eq('org_id', orgId).order('recording_date', { ascending: false }).limit(50);
    const rOr: string[] = [];
    for (const n of numbers) {
      rOr.push(`from_number.eq.${n}`);
      rOr.push(`to_number.eq.${n}`);
    }
    if (rOr.length > 0) rq = rq.or(rOr.join(','));
    const { data: recs, error: rErr } = await rq;
    console.log('matching_recordings_count', (recs || []).length, rErr?.message || null);

    let sq = supabase.from('mightycall_sms_messages').select('id, from_number, to_number, created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(50);
    const sOr: string[] = [];
    for (const n of numbers) {
      sOr.push(`from_number.eq.${n}`);
      sOr.push(`to_number.eq.${n}`);
    }
    if (sOr.length > 0) sq = sq.or(sOr.join(','));
    const { data: sms, error: sErr } = await sq;
    console.log('matching_sms_count', (sms || []).length, sErr?.message || null);
  }
}

main().catch((e) => {
  console.error('debug_client_visibility_failed', e?.message || e);
  process.exit(1);
});
