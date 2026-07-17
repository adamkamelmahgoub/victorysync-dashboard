import { getEnvironmentHealth } from '../config/env';
import { getSchemaHealth } from '../lib/schemaHealth';
import { getMembershipDriftDetails } from '../lib/memberships';
import { supabaseAdmin } from '../lib/supabaseClient';
import crypto from 'crypto';

function stableLabel(value: unknown, prefix: string) {
  const raw = String(value || '');
  if (!raw) return null;
  return `${prefix}_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12)}`;
}

async function main() {
  const env = getEnvironmentHealth(true);
  const schema = await getSchemaHealth();
  const membership = await getMembershipDriftDetails(25);
  const { data, error: authError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const users = data?.users || [];

  const report = {
    checked_at: new Date().toISOString(),
    env,
    schema,
    membership: {
      org_users_count: membership.org_users_count,
      org_members_count: membership.org_members_count,
      mismatched_records: membership.mismatched_records,
      org_members_only: membership.org_members_only,
      org_users_only: membership.org_users_only,
      mismatched_rows: membership.mismatched_rows.map((row: any) => ({
        org_ref: stableLabel(row.org_id, 'org'),
        user_ref: stableLabel(row.user_id, 'user'),
        org_users_role: row.org_users_role || null,
        org_members_role: row.org_members_role || null,
      })),
      org_users_only_rows: membership.org_users_only_rows.map((row: any) => ({
        org_ref: stableLabel(row.org_id, 'org'),
        user_ref: stableLabel(row.user_id, 'user'),
        role: row.role || null,
      })),
      org_members_only_rows: membership.org_members_only_rows.map((row: any) => ({
        org_ref: stableLabel(row.org_id, 'org'),
        user_ref: stableLabel(row.user_id, 'user'),
        role: row.role || null,
      })),
    },
    auth_users: users.map((user) => ({
      user_ref: stableLabel(user.id, 'user'),
      email_domain: typeof user.email === 'string' && user.email.includes('@') ? user.email.split('@').pop() : null,
      global_role: (user.user_metadata as any)?.global_role || null,
      role: (user.user_metadata as any)?.role || null,
    })),
    auth_check: {
      ok: !authError,
      error: authError ? 'auth_provider_check_failed' : null,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  if (!env.ok || !schema.ok || authError || membership.mismatched_records > 0 || membership.org_members_only > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[production_readiness_check] failed:', err?.message || err);
  process.exit(1);
});
