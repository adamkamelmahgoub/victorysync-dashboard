import { supabaseAdmin } from './supabaseClient';

async function tableExists(table: string) {
  try {
    const { error } = await supabaseAdmin.from(table).select('*').limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function columnExists(table: string, column: string) {
  try {
    const { error } = await supabaseAdmin.from(table).select(column).limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function getSchemaHealth() {
  const criticalTables = [
    'profiles',
    'organizations',
    'org_users',
    'org_members',
    'calls',
    'mightycall_reports',
    'mightycall_recordings',
    'mightycall_sms_messages',
    'voicemail_logs',
    'live_agent_presence',
    'integration_sync_jobs',
    'audit_logs',
    'org_integrations',
    'org_feature_access',
    'user_feature_access',
  ];

  const criticalColumns: Array<{ table: string; column: string }> = [
    { table: 'profiles', column: 'global_role' },
    { table: 'org_users', column: 'mightycall_extension' },
    { table: 'calls', column: 'agent_extension' },
    { table: 'calls', column: 'metadata' },
    { table: 'live_agent_presence', column: 'extension' },
    { table: 'live_agent_presence', column: 'stale_after' },
    { table: 'mightycall_recordings', column: 'phone_number_id' },
    { table: 'mightycall_recordings', column: 'recording_date' },
    { table: 'mightycall_recordings', column: 'from_number' },
    { table: 'mightycall_recordings', column: 'to_number' },
    { table: 'integration_sync_jobs', column: 'status' },
  ];

  const tableChecks = await Promise.all(
    criticalTables.map(async (table) => ({ table, ok: await tableExists(table) }))
  );
  const columnChecks = await Promise.all(
    criticalColumns.map(async ({ table, column }) => ({ table, column, ok: await columnExists(table, column) }))
  );

  const missingTables = tableChecks.filter((row) => !row.ok).map((row) => row.table);
  const missingColumns = columnChecks.filter((row) => !row.ok).map((row) => `${row.table}.${row.column}`);

  // Trigger execution belongs in disposable-database tests, never a health read.
  const profileTriggerHealthy = null;
  const profileTriggerMessage = 'Not exercised by read-only diagnostics';

  return {
    ok: missingTables.length === 0 && missingColumns.length === 0,
    missing_tables: missingTables,
    missing_columns: missingColumns,
    profile_trigger_healthy: profileTriggerHealthy,
    profile_trigger_message: profileTriggerMessage,
    checked_at: new Date().toISOString(),
  };
}

export async function getSecurityPolicyHealth() {
  const orgScopedTables = new Set([
    'organizations',
    'org_users',
    'org_members',
    'phone_numbers',
    'org_phone_numbers',
    'calls',
    'mightycall_reports',
    'mightycall_recordings',
    'mightycall_sms_messages',
    'call_transfers',
    'live_agent_presence',
    'agent_live_status',
    'leads',
    'lead_sources',
    'org_integrations',
    'support_tickets',
    'org_feature_access',
    'user_feature_access',
  ]);

  let tableStatus: any[] = [];
  let tableError: string | null = null;
  try {
    const { data, error } = await supabaseAdmin.rpc('security_table_rls_status');
    if (error) throw error;
    tableStatus = data || [];
  } catch (err: any) {
    tableError = err?.message || String(err);
  }

  let bucketStatus: any[] = [];
  let bucketError: string | null = null;
  try {
    const { data, error } = await supabaseAdmin.rpc('security_storage_bucket_status');
    if (error) throw error;
    bucketStatus = data || [];
  } catch (err: any) {
    bucketError = err?.message || String(err);
  }

  const missingRls = tableStatus
    .filter((row) => !row.rls_enabled)
    .map((row) => row.table_name);
  const missingPolicies = tableStatus
    .filter((row) => Number(row.policy_count || 0) === 0)
    .map((row) => row.table_name);
  const missingTables = [...orgScopedTables].filter(name => !tableStatus.some(row => row.table_name === name));
  const publicBuckets = bucketStatus
    .filter((row) => row.public === true)
    .map((row) => row.name || row.id);

  const unexpectedPublicBuckets = publicBuckets.filter(name => name !== 'brand-assets');
  return {
    coverage: 'RLS and policy presence only. Tenant isolation requires separate behavioral tests.',
    missing_tables: missingTables,
    unexpected_public_buckets: unexpectedPublicBuckets,
    ok: missingTables.length === 0 && unexpectedPublicBuckets.length === 0 && !tableError && !bucketError && missingRls.length === 0 && missingPolicies.length === 0,
    table_status: tableStatus,
    bucket_status: bucketStatus,
    missing_rls: missingRls,
    missing_policies: missingPolicies,
    public_buckets: publicBuckets,
    table_error: tableError,
    bucket_error: bucketError,
    checked_at: new Date().toISOString(),
  };
}
