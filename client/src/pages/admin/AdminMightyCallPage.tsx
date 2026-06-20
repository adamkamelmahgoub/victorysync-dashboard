import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../../components/DashboardPrimitives';
import { deleteOrgIntegration, getOrgIntegrationHealth, getOrgIntegrations, listMightyCallSyncJobs, saveOrgIntegration } from '../../lib/apiClient';

interface Integration {
  id: string;
  org_id: string;
  integration_type: string;
  label: string;
  created_at: string;
  updated_at: string;
}

export default function AdminMightyCallPage() {
  const navigate = useNavigate();
  const { user, selectedOrgId, globalRole, orgs } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [userKey, setUserKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://ccapi.mightycall.com/v4');
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [integrationHealth, setIntegrationHealth] = useState<any | null>(null);
  const [syncJobs, setSyncJobs] = useState<any[]>([]);

  useEffect(() => {
    if (globalRole === 'platform_admin' && orgs && orgs.length > 0 && !activeOrgId) {
      setActiveOrgId(orgs[0].id);
    } else if (selectedOrgId) {
      setActiveOrgId(selectedOrgId);
    }
  }, [selectedOrgId, globalRole, orgs, activeOrgId]);

  useEffect(() => {
    if (!activeOrgId || !user?.id) return;
    void Promise.all([loadIntegrations(), loadIntegrationHealth(), loadSyncJobs()]);
  }, [activeOrgId, user?.id]);

  const loadIntegrations = async () => {
    if (!activeOrgId || !user?.id) return;
    try {
      setLoading(true);
      const data = await getOrgIntegrations(activeOrgId, user.id);
      setIntegrations(data.integrations || []);
      setError(null);
    } catch (err: any) {
      console.error('failed to load integrations:', err);
      setError(err?.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  const loadIntegrationHealth = async () => {
    if (!activeOrgId || !user?.id) return;
    try {
      const data = await getOrgIntegrationHealth(activeOrgId, user.id);
      setIntegrationHealth(data);
    } catch (err: any) {
      console.error('failed to load integration health:', err);
      setIntegrationHealth({
        error: err?.message || 'Failed to load integration health',
        checked_at: new Date().toISOString(),
      });
    }
  };

  const loadSyncJobs = async () => {
    if (!activeOrgId || !user?.id) return;
    try {
      const data = await listMightyCallSyncJobs({ orgId: activeOrgId, limit: 10 }, user.id);
      setSyncJobs(data.jobs || []);
    } catch (err: any) {
      console.error('failed to load sync jobs:', err);
    }
  };

  const handleSaveIntegration = async () => {
    if (!activeOrgId || !user?.id || !apiKey || !userKey) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setIsCreating(true);
      await saveOrgIntegration(
        activeOrgId,
        {
          integration_type: 'mightycall',
          label: 'MightyCall',
          credentials: { clientId: apiKey, clientSecret: userKey, apiKey, userKey, baseUrl }
        },
        user.id
      );
      setApiKey('');
      setUserKey('');
      setError(null);
      await Promise.all([loadIntegrations(), loadIntegrationHealth(), loadSyncJobs()]);
    } catch (err: any) {
      console.error('failed to save integration:', err);
      setError(err?.message || 'Failed to save integration');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteIntegration = async (integrationId: string) => {
    if (!activeOrgId || !user?.id) return;
    const check = window.prompt('Type DELETE to remove this integration.');
    if (check !== 'DELETE') return;
    try {
      await deleteOrgIntegration(activeOrgId, integrationId, user.id);
      await Promise.all([loadIntegrations(), loadIntegrationHealth(), loadSyncJobs()]);
    } catch (err: any) {
      console.error('failed to delete integration:', err);
      setError(err?.message || 'Failed to delete integration');
    }
  };

  if (!globalRole || !['platform_admin', 'org_admin'].includes(globalRole)) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-slate-400">You do not have permission to manage integrations.</p>
        </div>
      </main>
    );
  }

  const healthTone = integrationHealth?.error
    ? 'warning'
    : integrationHealth?.integration_configured && integrationHealth?.token_healthy
      ? 'success'
      : 'neutral';

  return (
    <PageLayout
      eyebrow="Integrations"
      title="MightyCall"
      description="Manage credentials, inspect connection health, and review sync posture before issues become production incidents."
      actions={<button onClick={() => navigate('/admin/orgs')} className="vs-button-secondary">Back To Orgs</button>}
    >
      <div className="space-y-6">
        <AdminTopNav />

        {globalRole === 'platform_admin' && orgs && orgs.length > 0 && (
          <SectionCard title="Active organization" description="Diagnostics and credentials are scoped to the selected organization.">
            <select value={activeOrgId || ''} onChange={(e) => setActiveOrgId(e.target.value)} className="vs-input w-full max-w-xl">
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </SectionCard>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-4">
          <MetricStatCard label="Credentials" value={integrationHealth?.integration_configured ? 'Configured' : 'Missing'} accent={integrationHealth?.integration_configured ? 'emerald' : 'amber'} hint="Stored integration state" />
          <MetricStatCard label="Token" value={integrationHealth?.token_healthy ? 'Healthy' : 'Failing'} accent={integrationHealth?.token_healthy ? 'emerald' : 'amber'} hint="Authentication to MightyCall" />
          <MetricStatCard label="Own Status" value={integrationHealth?.own_status_label || (integrationHealth?.own_status_healthy ? 'Readable' : 'Unavailable')} accent={integrationHealth?.own_status_healthy ? 'emerald' : 'amber'} hint="Current-user status returned by MightyCall" />
          <MetricStatCard label="Journal" value={integrationHealth?.journal_healthy ? 'Readable' : 'Unavailable'} accent={integrationHealth?.journal_healthy ? 'emerald' : 'amber'} hint="Live activity source" />
          <MetricStatCard label="Latest Sync" value={integrationHealth?.latest_sync_job?.status || 'None'} accent="neutral" hint={integrationHealth?.latest_sync_job?.created_at ? new Date(integrationHealth.latest_sync_job.created_at).toLocaleString() : 'No recorded sync jobs'} />
        </div>

        <SectionCard title="Connection health" description="These checks reduce guesswork when live status, reports, or recordings stop updating." actions={<StatusBadge tone={healthTone}>{integrationHealth?.error ? 'Attention' : 'Observed'}</StatusBadge>}>
          {!integrationHealth ? (
            <div className="text-sm text-slate-400">Loading integration diagnostics...</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="vs-surface-muted p-4 text-sm text-slate-300">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Checks</div>
	                <div className="mt-3 space-y-2">
	                  <div>Config readable: {String(!!integrationHealth.integration_readable)}</div>
	                  <div>Profile lookup: {String(!!integrationHealth.profile_healthy)}</div>
	                  <div>Live calls endpoint: {String(!!integrationHealth.live_calls_healthy)}</div>
	                  <div>Journal endpoint: {String(!!integrationHealth.journal_healthy)}</div>
	                  <div>Own status endpoint: {String(!!integrationHealth.own_status_healthy)}</div>
	                  <div>Own status label: {integrationHealth.own_status_label || '-'}</div>
	                </div>
	              </div>
              <div className="vs-surface-muted p-4 text-sm text-slate-300">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Diagnostics</div>
                <div className="mt-3 break-words">{integrationHealth.error || 'No integration-level error detected.'}</div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Credentials" description="Make changes deliberately. Save, then confirm the health checks and sync jobs reflect the update.">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter MightyCall API Key" className="vs-input w-full" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">User Key</label>
              <input type="password" value={userKey} onChange={(e) => setUserKey(e.target.value)} placeholder="Enter MightyCall User Key" className="vs-input w-full" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-300">Base URL</label>
              <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://ccapi.mightycall.com/v4" className="vs-input w-full" />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button onClick={handleSaveIntegration} disabled={isCreating || !apiKey || !userKey} className="vs-button-primary">
                {isCreating ? 'Saving...' : 'Save Integration'}
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Active integrations" description="Delete actions require typed confirmation to reduce accidental outages.">
          {loading ? (
            <div className="text-sm text-slate-400">Loading integrations...</div>
          ) : integrations.length === 0 ? (
            <EmptyStatePanel title="No integrations configured" description="Add MightyCall credentials to enable syncs, live status, recordings, and extension verification for this organization." />
          ) : (
            <div className="space-y-3">
              {integrations.map((integration) => (
                <div key={integration.id} className="vs-surface-muted flex items-center justify-between gap-4 p-4">
                  <div>
                    <h3 className="font-medium text-slate-100">{integration.label}</h3>
                    <p className="text-xs text-slate-400">Type: {integration.integration_type} · Updated: {new Date(integration.updated_at).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => handleDeleteIntegration(integration.id)} className="vs-button-secondary text-red-200 hover:bg-red-500/10 hover:text-red-200">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recent sync jobs" description="Use this history to see failures, stale syncs, and processing volume.">
          {syncJobs.length === 0 ? (
            <EmptyStatePanel title="No sync jobs recorded" description="Sync jobs will appear here once reports, recordings, SMS, or webhook-backed jobs run for this organization." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2">Processed</th>
                    <th className="px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {syncJobs.map((job) => (
                    <tr key={job.id} className="border-t border-white/[0.04] text-slate-200">
                      <td className="px-3 py-3">{job.integration_type}</td>
                      <td className="px-3 py-3">{job.status}</td>
                      <td className="px-3 py-3">{job.started_at ? new Date(job.started_at).toLocaleString() : '-'}</td>
                      <td className="px-3 py-3">{job.records_processed ?? 0}</td>
                      <td className="px-3 py-3 text-amber-200">{job.error_message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PageLayout>
  );
}
