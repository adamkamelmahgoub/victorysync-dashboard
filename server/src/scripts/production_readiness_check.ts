import { getEnvironmentHealth } from '../config/env';
import { getSchemaHealth } from '../lib/schemaHealth';
import { getMembershipDriftDetails } from '../lib/memberships';
import { supabaseAdmin } from '../lib/supabaseClient';

async function main() {
  const env = getEnvironmentHealth();
  const schema = await getSchemaHealth();
  const membership = await getMembershipDriftDetails(25);
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const users = data?.users || [];

  const report = {
    checked_at: new Date().toISOString(),
    env,
    schema,
    membership,
    auth_users: users.map((user) => ({
      id: user.id,
      email: user.email,
      global_role: (user.user_metadata as any)?.global_role || null,
      role: (user.user_metadata as any)?.role || null,
    })),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!env.ok || !schema.ok || membership.mismatched_records > 0 || membership.org_members_only > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[production_readiness_check] failed:', err?.message || err);
  process.exit(1);
});
