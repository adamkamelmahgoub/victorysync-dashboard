import { useCallback, useEffect, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { MetricStatCard, SectionCard, StatusBadge } from '../../components/DashboardPrimitives';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';
import { getAiQualificationDashboard, getAiQualificationSettings, saveAiQualificationSettings, testAiQualificationConnection } from '../../lib/apiClient';

type DashboardData = {
  metrics: { calls_today: number; qualification_rate: number; ai_resolved: number; human_escalated: number };
  campaigns: Array<{ campaign_id: string; name: string; client: string; calls: number; qualified: number; qualification_rate: number }>;
  calls: any[];
};

export default function AdminAiQualificationPage() {
  const { user, selectedOrgId, orgs } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>({
    campaign: { name: 'Google Ads Audit Booking', client_name: 'Revv Marketing / Randy James', active: true, qualified_threshold: 60, positive_signals: 'google ads, ad spend, audit, decision maker, interested', negative_signals: 'not interested, do not call, wrong number', booking_signals: 'booked, appointment confirmed, calendar confirmed', rall_id: '', shehab_id: '' },
    vapi: { private_api_key: '', assistant_id: '', phone_number_id: '', webhook_secret: '' }, hubspot: { access_token: '' }, webhook_url: '', configured: {},
  });

  const load = useCallback(async () => {
    if (!user?.id) return;
    setError(null);
    try {
      setData(await getAiQualificationDashboard(user.id) as DashboardData);
    } catch (err: any) {
      setError(err?.message || 'Unable to load AI call activity.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!user?.id || !selectedOrgId) return;
    void getAiQualificationSettings(selectedOrgId, user.id).then((payload: any) => {
      const campaign = payload.campaigns?.[0];
      const qc = campaign?.qualification_config || {};
      const agents = campaign?.routing_config?.agents || [];
      setSettings((current: any) => ({ ...current, campaign: { ...current.campaign, id: campaign?.id, name: campaign?.name || current.campaign.name, client_name: campaign?.client_name || current.campaign.client_name, active: campaign?.active ?? true,
        qualified_threshold: qc.qualified_threshold ?? 60, positive_signals: (qc.positive_signals || []).join(', '), negative_signals: (qc.negative_signals || []).join(', '), booking_signals: (qc.booking_signals || []).join(', '),
        rall_id: agents.find((a: any) => a.name === 'Rall')?.id || '', shehab_id: agents.find((a: any) => a.name === 'Shehab')?.id || '' },
        vapi: { ...current.vapi, assistant_id: payload.integrations?.vapi?.assistant_id || '', phone_number_id: payload.integrations?.vapi?.phone_number_id || '' },
        configured: payload.integrations, webhook_url: payload.webhook_url || '' }));
    }).catch((err: any) => setError(err?.message || 'Unable to load configuration.'));
  }, [selectedOrgId, user?.id]);

  const saveSettings = async () => {
    if (!selectedOrgId || !user?.id) return;
    setSaving(true); setError(null);
    try {
      const list = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
      await saveAiQualificationSettings({ organization_id: selectedOrgId, campaign: { id: settings.campaign.id, name: settings.campaign.name, client_name: settings.campaign.client_name, active: settings.campaign.active,
        qualification_config: { qualified_threshold: Number(settings.campaign.qualified_threshold), positive_signals: list(settings.campaign.positive_signals), negative_signals: list(settings.campaign.negative_signals), booking_signals: list(settings.campaign.booking_signals) },
        routing_config: { agents: [{ name: 'Rall', id: settings.campaign.rall_id || null }, { name: 'Shehab', id: settings.campaign.shehab_id || null }] } }, vapi: settings.vapi, hubspot: settings.hubspot }, user.id);
      setSettings((value: any) => ({ ...value, vapi: { ...value.vapi, private_api_key: '', webhook_secret: '' }, hubspot: { access_token: '' } }));
      await load();
    } catch (err: any) { setError(err?.message || 'Unable to save configuration.'); } finally { setSaving(false); }
  };

  const field = (group: 'campaign' | 'vapi' | 'hubspot', key: string, label: string, type = 'text', placeholder = '') => (
    <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">{label}</span><input type={type} value={settings[group][key] ?? ''} placeholder={placeholder}
      onChange={(event) => setSettings((value: any) => ({ ...value, [group]: { ...value[group], [key]: event.target.value } }))} className="vs-input w-full" /></label>
  );

  const metrics = data?.metrics || { calls_today: 0, qualification_rate: 0, ai_resolved: 0, human_escalated: 0 };

  return (
    <PageLayout
      eyebrow="AI qualification pilot"
      title="Qualification & routing"
      description="Internal monitoring for the Revv Marketing / Randy James Google Ads audit pilot."
      actions={<button type="button" onClick={() => void load()} className="vs-button-secondary">Refresh</button>}
    >
      <div className="space-y-6 p-4 sm:p-6">
        <AdminTopNav />
        {!selectedOrgId && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Select an organization from the top bar to configure the pilot.</div>}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error.includes('migration') ? 'Apply migration 040_ai_qualification_engine.sql before opening this module.' : error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricStatCard label="Calls today" value={metrics.calls_today} loading={loading} accent="violet" hint="AI outbound attempts since midnight" />
          <MetricStatCard label="Qualification rate" value={`${metrics.qualification_rate}%`} loading={loading} accent="emerald" hint="Qualified among scored calls" />
          <MetricStatCard label="AI resolved" value={metrics.ai_resolved} loading={loading} accent="cyan" hint="Closed without a human handoff" />
          <MetricStatCard label="Human escalated" value={metrics.human_escalated} loading={loading} accent="amber" hint="Routed to Rall or Shehab" />
        </div>

        <SectionCard title="Pilot configuration" description={`Manage Vapi, HubSpot, scoring, and routing for ${orgs.find((org) => org.id === selectedOrgId)?.name || 'the selected organization'}`} actions={<button className="vs-button-primary" disabled={!selectedOrgId || saving} onClick={() => void saveSettings()}>{saving ? 'Saving…' : 'Save configuration'}</button>}>
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-3"><h3 className="font-semibold text-slate-950">Campaign</h3>{field('campaign', 'name', 'Campaign name')}{field('campaign', 'client_name', 'Client')}{field('campaign', 'qualified_threshold', 'Qualified threshold', 'number')}{field('campaign', 'positive_signals', 'Positive signals')}{field('campaign', 'negative_signals', 'Negative signals')}{field('campaign', 'booking_signals', 'Booking signals')}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.campaign.active} onChange={(event) => setSettings((value: any) => ({ ...value, campaign: { ...value.campaign, active: event.target.checked } }))} />Campaign active</label></div>
            <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold text-slate-950">Vapi</h3><StatusBadge tone={settings.configured?.vapi?.configured ? 'success' : 'warning'}>{settings.configured?.vapi?.configured ? 'Configured' : 'Not configured'}</StatusBadge></div>
              {field('vapi', 'private_api_key', 'Private API key', 'password', settings.configured?.vapi?.configured ? 'Leave blank to keep saved key' : 'Required')}{field('vapi', 'assistant_id', 'Assistant ID')}{field('vapi', 'phone_number_id', 'Phone number ID')}{field('vapi', 'webhook_secret', 'Webhook secret', 'password', settings.configured?.vapi?.webhook_secret_configured ? 'Leave blank to keep saved secret' : 'Required')}
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><div className="font-semibold">Vapi Server URL</div><div className="mt-1 break-all">{settings.webhook_url || 'Save configuration to load URL'}</div><div className="mt-2">Configure Vapi to send this value as <code>X-Vapi-Secret</code>.</div></div>
              <button className="vs-button-secondary" disabled={!selectedOrgId} onClick={() => selectedOrgId && void testAiQualificationConnection(selectedOrgId, 'vapi', user?.id).then(() => alert('Vapi connection succeeded')).catch((e) => setError(e.message))}>Test Vapi</button></div>
            <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold text-slate-950">Routing & HubSpot</h3><StatusBadge tone={settings.configured?.hubspot?.configured ? 'success' : 'warning'}>{settings.configured?.hubspot?.configured ? 'HubSpot connected' : 'HubSpot not configured'}</StatusBadge></div>
              {field('campaign', 'rall_id', 'Rall user UUID')}{field('campaign', 'shehab_id', 'Shehab user UUID')}{field('hubspot', 'access_token', 'HubSpot private-app token', 'password', settings.configured?.hubspot?.configured ? 'Leave blank to keep saved token' : 'Optional')}
              <button className="vs-button-secondary" disabled={!selectedOrgId || !settings.configured?.hubspot?.configured} onClick={() => selectedOrgId && void testAiQualificationConnection(selectedOrgId, 'hubspot', user?.id).then(() => alert('HubSpot connection succeeded')).catch((e) => setError(e.message))}>Test HubSpot</button></div>
          </div>
        </SectionCard>

        <SectionCard title="Campaign performance" description="Pilot campaign results for today">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr><th className="pb-3">Campaign</th><th className="pb-3">Client</th><th className="pb-3">Calls</th><th className="pb-3">Qualified</th><th className="pb-3">Rate</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.campaigns || []).map((campaign) => (
                  <tr key={campaign.campaign_id}>
                    <td className="py-3 font-semibold text-slate-900">{campaign.name}</td><td className="py-3 text-slate-600">{campaign.client}</td>
                    <td className="py-3">{campaign.calls}</td><td className="py-3">{campaign.qualified}</td><td className="py-3">{campaign.qualification_rate}%</td>
                  </tr>
                ))}
                {!loading && !(data?.campaigns || []).length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No AI calls today.</td></tr>}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Recent AI calls" description="Latest vendor activity and routing decisions">
          <div className="space-y-3">
            {(data?.calls || []).map((call) => {
              const lead = Array.isArray(call.leads) ? call.leads[0] : call.leads;
              const campaign = Array.isArray(call.ai_campaigns) ? call.ai_campaigns[0] : call.ai_campaigns;
              const result = Array.isArray(call.qualification_results) ? call.qualification_results[0] : call.qualification_results;
              return (
                <div key={call.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="font-semibold text-slate-950">{[lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || lead?.phone || 'Unknown lead'}</div>
                    <div className="mt-1 text-xs text-slate-500">{campaign?.name || 'Campaign'} · {new Date(call.created_at).toLocaleString()} · {call.duration_seconds || 0}s</div></div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={result?.qualified ? 'success' : result ? 'warning' : 'neutral'}>{result ? `${result.score} / 100` : call.status}</StatusBadge>
                    {result && <StatusBadge tone={result.next_action === 'escalate_to_human' ? 'violet' : 'info'}>{result.next_action.replaceAll('_', ' ')}</StatusBadge>}
                  </div>
                </div>
              );
            })}
            {!loading && !(data?.calls || []).length && <div className="py-8 text-center text-sm text-slate-500">No AI call activity yet.</div>}
          </div>
        </SectionCard>
      </div>
    </PageLayout>
  );
}
