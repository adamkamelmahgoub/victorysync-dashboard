import { supabaseAdmin } from './supabaseClient';

async function tableExists(table: string) {
  try {
    const { error } = await supabaseAdmin.from(table).select('*').limit(1);
    if (!error) return true;
    return !String(error.message || '').includes('Could not find the table');
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

  let profileTriggerHealthy = true;
  let profileTriggerMessage: string | null = null;
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ global_role: 'platform_admin' })
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .select('id')
      .maybeSingle();
    if (error && String(error.message || '').includes('updated_at')) {
      profileTriggerHealthy = false;
      profileTriggerMessage = error.message;
    }
  } catch (err: any) {
    if (String(err?.message || '').includes('updated_at')) {
      profileTriggerHealthy = false;
      profileTriggerMessage = err.message;
    }
  }

  return {
    ok: missingTables.length === 0 && missingColumns.length === 0 && profileTriggerHealthy,
    missing_tables: missingTables,
    missing_columns: missingColumns,
    profile_trigger_healthy: profileTriggerHealthy,
    profile_trigger_message: profileTriggerMessage,
    checked_at: new Date().toISOString(),
  };
}
