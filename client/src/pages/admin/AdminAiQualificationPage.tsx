import { useCallback, useEffect, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { MetricStatCard, SectionCard, StatusBadge } from '../../components/DashboardPrimitives';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';
import { getAiQualificationDashboard } from '../../lib/apiClient';

type DashboardData = {
  metrics: { calls_today: number; qualification_rate: number; ai_resolved: number; human_escalated: number };
  campaigns: Array<{ campaign_id: string; name: string; client: string; calls: number; qualified: number; qualification_rate: number }>;
  calls: any[];
};

export default function AdminAiQualificationPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
