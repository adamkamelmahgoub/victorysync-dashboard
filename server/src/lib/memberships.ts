import { supabaseAdmin } from './supabaseClient';

export type CanonicalMembership = {
  source: 'org_users' | 'org_members';
  id: string;
  org_id: string;
  user_id: string;
  role: string | null;
  mightycall_extension?: string | null;
};

export async function getCanonicalMembership(orgId: string, userId: string): Promise<CanonicalMembership | null> {
  try {
    const { data } = await supabaseAdmin
      .from('org_users')
      .select('id, org_id, user_id, role, mightycall_extension')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data) return { source: 'org_users', ...(data as any) };
  } catch {}

  try {
    const { data } = await supabaseAdmin
      .from('org_members')
      .select('id, org_id, user_id, role, mightycall_extension')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data) return { source: 'org_members', ...(data as any) };
  } catch {}

  return null;
}

export async function getMembershipDriftSummary() {
  const summary = {
    org_users_count: 0,
    org_members_count: 0,
    mismatched_records: 0,
    org_members_only: 0,
    org_users_only: 0,
  };

  try {
    const [{ data: orgUsers }, { data: orgMembers }] = await Promise.all([
      supabaseAdmin.from('org_users').select('org_id, user_id, role'),
      supabaseAdmin.from('org_members').select('org_id, user_id, role'),
    ]);
    const ou = Array.isArray(orgUsers) ? orgUsers : [];
    const om = Array.isArray(orgMembers) ? orgMembers : [];
    summary.org_users_count = ou.length;
    summary.org_members_count = om.length;

    const ouMap = new Map(ou.map((row: any) => [`${row.org_id}:${row.user_id}`, String(row.role || '')]));
    const omMap = new Map(om.map((row: any) => [`${row.org_id}:${row.user_id}`, String(row.role || '')]));
    const keys = new Set([...Array.from(ouMap.keys()), ...Array.from(omMap.keys())]);
    for (const key of keys) {
      const ouRole = ouMap.get(key);
      const omRole = omMap.get(key);
      if (ouRole && !omRole) summary.org_users_only += 1;
      else if (!ouRole && omRole) summary.org_members_only += 1;
      else if (ouRole !== omRole) summary.mismatched_records += 1;
    }
  } catch (err: any) {
    console.warn('[memberships] drift summary failed:', err?.message || err);
  }

  return summary;
}

export async function getMembershipDriftDetails(limit = 100) {
  const summary = await getMembershipDriftSummary();
  const details = {
    ...summary,
    mismatched_rows: [] as Array<{ org_id: string; user_id: string; org_users_role: string | null; org_members_role: string | null }>,
    org_users_only_rows: [] as Array<{ org_id: string; user_id: string; role: string | null }>,
    org_members_only_rows: [] as Array<{ org_id: string; user_id: string; role: string | null }>,
  };

  try {
    const [{ data: orgUsers }, { data: orgMembers }] = await Promise.all([
      supabaseAdmin.from('org_users').select('org_id, user_id, role').limit(5000),
      supabaseAdmin.from('org_members').select('org_id, user_id, role').limit(5000),
    ]);
    const ou = Array.isArray(orgUsers) ? orgUsers : [];
    const om = Array.isArray(orgMembers) ? orgMembers : [];
    details.org_users_count = ou.length;
    details.org_members_count = om.length;

    const ouMap = new Map(ou.map((row: any) => [`${row.org_id}:${row.user_id}`, row]));
    const omMap = new Map(om.map((row: any) => [`${row.org_id}:${row.user_id}`, row]));
    const keys = new Set([...Array.from(ouMap.keys()), ...Array.from(omMap.keys())]);

    for (const key of keys) {
      const ouRow = ouMap.get(key) as any;
      const omRow = omMap.get(key) as any;

      if (ouRow && !omRow) {
        details.org_users_only_rows.push({
          org_id: ouRow.org_id,
          user_id: ouRow.user_id,
          role: ouRow.role ?? null,
        });
      } else if (!ouRow && omRow) {
        details.org_members_only_rows.push({
          org_id: omRow.org_id,
          user_id: omRow.user_id,
          role: omRow.role ?? null,
        });
      } else if ((ouRow?.role ?? null) !== (omRow?.role ?? null)) {
        details.mismatched_rows.push({
          org_id: ouRow?.org_id || omRow?.org_id,
          user_id: ouRow?.user_id || omRow?.user_id,
          org_users_role: ouRow?.role ?? null,
          org_members_role: omRow?.role ?? null,
        });
      }
    }
  } catch (err: any) {
    console.warn('[memberships] drift details failed:', err?.message || err);
  }

  return {
    ...details,
    mismatched_rows: details.mismatched_rows.slice(0, limit),
    org_users_only_rows: details.org_users_only_rows.slice(0, limit),
    org_members_only_rows: details.org_members_only_rows.slice(0, limit),
  };
}
