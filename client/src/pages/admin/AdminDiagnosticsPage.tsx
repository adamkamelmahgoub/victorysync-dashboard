import { useEffect, useState } from 'react';
import { PageLayout } from '../../components/PageLayout';
import AdminTopNav from '../../components/AdminTopNav';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../../components/DashboardPrimitives';
import { useAuth } from '../../contexts/AuthContext';
import { getAdminAuditLogs, getMembershipDrift, getProductionHealth } from '../../lib/apiClient';

export default function AdminDiagnosticsPage() {
  const { user } = useAuth();
  const [productionHealth, setProductionHealth] = useState<any | null>(null);
  const [membershipDrift, setMembershipDrift] = useState<any | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const [health, drift, audits] = await Promise.all([
        getProductionHealth(user.id),
        getMembershipDrift(user.id, 25),
        getAdminAuditLogs(user.id, { limit: 20 }),
      ]);
      setProductionHealth(health);
      setMembershipDrift(drift);
      setAuditLogs(audits.logs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.id]);

  return (
    <PageLayout
      eyebrow="Diagnostics"
      title="Production Diagnostics"
      description="Schema health, membership drift, environment readiness, and recent privileged actions in one dedicated admin surface."
      actions={<button className="vs-button-secondary" onClick={() => void load()}>Refresh Diagnostics</button>}
    >
      <div className="space-y-6">
        <AdminTopNav />

        <SectionCard
          title="Readiness"
          description="Production checks should stay green before shipping operational changes."
          actions={<StatusBadge tone={productionHealth?.ok ? 'success' : 'warning'}>{productionHealth?.ok ? 'Healthy' : 'Attention Needed'}</StatusBadge>}
        >
          {!productionHealth ? (
            <div className="text-sm text-slate-400">{loading ? 'Loading diagnostics...' : 'No production data available.'}</div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-4">
                <MetricStatCard label="Schema" value={productionHealth.schema?.ok ? 'Healthy' : 'Drift'} accent={productionHealth.schema?.ok ? 'emerald' : 'amber'} hint={`${productionHealth.schema?.missing_tables?.length || 0} missing tables`} />
                <MetricStatCard label="Memberships" value={membershipDrift && (membershipDrift.org_users_only || membershipDrift.org_members_only || membershipDrift.mismatched_records) ? 'Drift' : 'Aligned'} accent={membershipDrift && (membershipDrift.org_users_only || membershipDrift.org_members_only || membershipDrift.mismatched_records) ? 'amber' : 'emerald'} hint={`${membershipDrift?.org_users_only || 0} org_users-only rows`} />
                <MetricStatCard label="Auth Users" value={String(productionHealth.auth_users_count || 0)} accent="neutral" hint="Current authentication footprint" />
                <MetricStatCard label="Environment" value={productionHealth.env?.ok ? 'Configured' : 'Missing'} accent={productionHealth.env?.ok ? 'emerald' : 'amber'} hint={`CORS restricted: ${productionHealth.env?.recommendations?.restrict_cors_origin ? 'no' : 'yes'}`} />
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="vs-surface-muted p-4 text-sm text-slate-300">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Missing Tables</div>
                  <div className="mt-3 space-y-2">
                    {productionHealth.schema?.missing_tables?.length ? productionHealth.schema.missing_tables.map((item: string) => <div key={item}>{item}</div>) : <div>None</div>}
                  </div>
                </div>
                <div className="vs-surface-muted p-4 text-sm text-slate-300">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Missing Columns</div>
                  <div className="mt-3 space-y-2">
                    {productionHealth.schema?.missing_columns?.length ? productionHealth.schema.missing_columns.map((item: string) => <div key={item}>{item}</div>) : <div>None</div>}
                  </div>
                </div>
                <div className="vs-surface-muted p-4 text-sm text-slate-300">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Recommendations</div>
                  <div className="mt-3 space-y-2">
                    <div>Frontend origin restricted: {productionHealth.env?.recommendations?.restrict_cors_origin ? 'No' : 'Yes'}</div>
                    <div>Encrypted integration key present: {productionHealth.env?.recommendations?.encrypted_integrations_ready ? 'Yes' : 'No'}</div>
                    <div>Profile trigger: {productionHealth.schema?.profile_trigger_healthy ? 'Healthy' : productionHealth.schema?.profile_trigger_message || 'Needs migration'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <SectionCard
            title="Membership Drift"
            description="Readable org and user names show where legacy membership rows still need cleanup."
            actions={<StatusBadge tone={membershipDrift && (membershipDrift.org_users_only || membershipDrift.org_members_only || membershipDrift.mismatched_records) ? 'warning' : 'success'}>{membershipDrift && (membershipDrift.org_users_only || membershipDrift.org_members_only || membershipDrift.mismatched_records) ? 'Drift Detected' : 'Aligned'}</StatusBadge>}
          >
            {!membershipDrift ? (
              <div className="text-sm text-slate-400">{loading ? 'Loading membership drift...' : 'No drift data available.'}</div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricStatCard label="Org Users Only" value={membershipDrift.org_users_only || 0} accent={membershipDrift.org_users_only ? 'amber' : 'emerald'} hint="Rows only in org_users" />
                  <MetricStatCard label="Org Members Only" value={membershipDrift.org_members_only || 0} accent={membershipDrift.org_members_only ? 'amber' : 'emerald'} hint="Rows only in org_members" />
                  <MetricStatCard label="Role Mismatches" value={membershipDrift.mismatched_records || 0} accent={membershipDrift.mismatched_records ? 'amber' : 'emerald'} hint="Conflicting membership roles" />
                </div>
                <div className="grid gap-4 xl:grid-cols-3">
                  <div className="vs-surface-muted p-4 text-xs text-slate-300">
                    <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">Org Users Only</div>
                    <div className="space-y-2">
                      {membershipDrift.org_users_only_rows?.length ? membershipDrift.org_users_only_rows.slice(0, 8).map((row: any) => (
                        <div key={`${row.org_id}:${row.user_id}`}>
                          <div className="font-medium text-slate-100">{row.org_name}</div>
                          <div>{row.user_email}</div>
                          <div className="text-slate-500">{row.role || 'no role'}</div>
                        </div>
                      )) : <div className="text-slate-500">None</div>}
                    </div>
                  </div>
                  <div className="vs-surface-muted p-4 text-xs text-slate-300">
                    <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">Org Members Only</div>
                    <div className="space-y-2">
                      {membershipDrift.org_members_only_rows?.length ? membershipDrift.org_members_only_rows.slice(0, 8).map((row: any) => (
                        <div key={`${row.org_id}:${row.user_id}`}>
                          <div className="font-medium text-slate-100">{row.org_name}</div>
                          <div>{row.user_email}</div>
                          <div className="text-slate-500">{row.role || 'no role'}</div>
                        </div>
                      )) : <div className="text-slate-500">None</div>}
                    </div>
                  </div>
                  <div className="vs-surface-muted p-4 text-xs text-slate-300">
                    <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">Role Mismatches</div>
                    <div className="space-y-2">
                      {membershipDrift.mismatched_rows?.length ? membershipDrift.mismatched_rows.slice(0, 8).map((row: any) => (
                        <div key={`${row.org_id}:${row.user_id}`}>
                          <div className="font-medium text-slate-100">{row.org_name}</div>
                          <div>{row.user_email}</div>
                          <div className="text-slate-500">org_users={row.org_users_role || 'none'} · org_members={row.org_members_role || 'none'}</div>
                        </div>
                      )) : <div className="text-slate-500">None</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Audit Trail"
            description="Recent privileged actions with readable actor and organization names."
            actions={<StatusBadge tone="info">{auditLogs.length} recent entries</StatusBadge>}
          >
            {auditLogs.length === 0 ? (
              <EmptyStatePanel title="No audit events found" description="Audit logs will appear here as admin actions are performed." />
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log: any, index) => (
                  <div key={log.id || `${log.action}-${index}`} className="vs-surface-muted p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-slate-100">{log.action}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          Actor: {log.actor_email || log.actor_id || 'system'} · Org: {log.org_name || log.org_id || 'platform'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {log.entity_type || 'entity'} {log.entity_id ? `· ${log.entity_id}` : ''}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </PageLayout>
  );
}
