import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { getLeadGenHubSummary, type LeadGenHubSummary } from '../lib/apiClient';

type LeadGenView = 'hub' | 'campaigns' | 'forms' | 'automations' | 'sequences' | 'integrations';

const viewCopy: Record<LeadGenView, { title: string; description: string; focus: string }> = {
  hub: {
    title: 'Lead Gen Hub',
    description: 'Manage campaigns, forms, automations, sequences, and lead routing from inside VictorySync.',
    focus: 'Revenue command center',
  },
  campaigns: {
    title: 'Lead Campaigns',
    description: 'Track lead sources, campaign routing, intake quality, and source performance.',
    focus: 'Campaign operations',
  },
  forms: {
    title: 'Lead Forms',
    description: 'Connect intake forms and inbound lead capture flows to the VictorySync leads database.',
    focus: 'Capture surfaces',
  },
  automations: {
    title: 'Lead Automations',
    description: 'Coordinate new lead notifications, follow-up tasks, transfer workflows, and routing rules.',
    focus: 'Workflow control',
  },
  sequences: {
    title: 'Lead Sequences',
    description: 'Build the follow-up cadence that turns new leads into calls, conversations, and transfers.',
    focus: 'Follow-up engine',
  },
  integrations: {
    title: 'Lead Integrations',
    description: 'Monitor source connections, webhooks, uploads, and backend lead ingestion health.',
    focus: 'Connected systems',
  },
};

const fallbackModules: LeadGenHubSummary['modules'] = [
  {
    key: 'leads',
    label: 'Lead Inbox',
    path: '/leads',
    status: 'live',
    description: 'Review, filter, and act on Supabase-backed lead records.',
    metric_label: 'Source',
    metric_value: 'Live',
  },
  {
    key: 'campaigns',
    label: 'Campaigns',
    path: '/lead-gen/campaigns',
    status: 'connected',
    description: 'Organize lead sources by campaign, lead type, and routing priority.',
    metric_label: 'Status',
    metric_value: 'Connected',
  },
  {
    key: 'forms',
    label: 'Forms',
    path: '/lead-gen/forms',
    status: 'connected',
    description: 'Use inbound endpoints and uploads to feed qualified prospects into VictorySync.',
    metric_label: 'Status',
    metric_value: 'Ready',
  },
  {
    key: 'automations',
    label: 'Automations',
    path: '/lead-gen/automations',
    status: 'connected',
    description: 'Route alerts and follow-up steps using the existing backend lead workflow.',
    metric_label: 'Status',
    metric_value: 'Ready',
  },
  {
    key: 'sequences',
    label: 'Sequences',
    path: '/lead-gen/sequences',
    status: 'planned',
    description: 'Plan nurture steps that will connect to SMS, calls, and agent assignments.',
    metric_label: 'Status',
    metric_value: 'Next',
  },
  {
    key: 'integrations',
    label: 'Integrations',
    path: '/lead-gen/integrations',
    status: 'live',
    description: 'Watch webhook, source, upload, and ingestion health from the dashboard.',
    metric_label: 'Status',
    metric_value: 'Live',
  },
];

const statusClass: Record<string, string> = {
  live: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  connected: 'border-violet-200 bg-violet-50 text-violet-700',
  planned: 'border-amber-200 bg-amber-50 text-amber-700',
};

export const LeadGenHubPage: React.FC<{ view?: LeadGenView }> = ({ view = 'hub' }) => {
  const navigate = useNavigate();
  const { selectedOrgId } = useAuth();
  const [data, setData] = useState<LeadGenHubSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const copy = viewCopy[view];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLeadGenHubSummary({ orgId: selectedOrgId })
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Lead generation status is unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOrgId]);

  const modules = data?.modules?.length ? data.modules : fallbackModules;
  const activeModule = useMemo(() => {
    if (view === 'hub') return null;
    return modules.find((module) => module.key === view) || null;
  }, [modules, view]);

  const summary = data?.summary || {
    total_leads: 0,
    new_leads: 0,
    active_sources: 0,
    uploads: 0,
  };

  return (
    <PageLayout title={copy.title} description={copy.description} eyebrow="Lead generation">
      <div className="space-y-6">
        <section className="vs-surface overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="p-7">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-violet-700">{copy.focus}</div>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950">{copy.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{copy.description}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => navigate('/leads')} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700">
                  Open Lead Inbox
                </button>
                <button type="button" onClick={() => navigate('/lead-gen/integrations')} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
                  View Integrations
                </button>
              </div>
              {error && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{error}</div>}
            </div>
            <div className="border-t border-slate-200 bg-slate-50/70 p-7 lg:border-l lg:border-t-0">
              <div className="text-xs font-bold uppercase text-slate-500">{loading ? 'Loading live status' : 'Live backend status'}</div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Metric label="Total leads" value={summary.total_leads} />
                <Metric label="New leads" value={summary.new_leads} />
                <Metric label="Active sources" value={summary.active_sources} />
                <Metric label="Uploads" value={summary.uploads} />
              </div>
            </div>
          </div>
        </section>

        {activeModule && (
          <section className="vs-surface p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[11px] font-extrabold uppercase text-slate-500">Current module</div>
                <h2 className="mt-2 text-2xl font-black text-slate-950">{activeModule.label}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{activeModule.description}</p>
              </div>
              <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass[activeModule.status] || statusClass.connected}`}>
                {activeModule.status}
              </span>
            </div>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <button
              key={module.key}
              type="button"
              onClick={() => navigate(module.path)}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-slate-950">{module.label}</h3>
                  <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-600">{module.description}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass[module.status] || statusClass.connected}`}>
                  {module.status}
                </span>
              </div>
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-bold uppercase text-slate-500">{module.metric_label}</div>
                <div className="mt-1 text-xl font-black text-slate-950">{module.metric_value}</div>
              </div>
            </button>
          ))}
        </section>
      </div>
    </PageLayout>
  );
};

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

export const LeadGenCampaignsPage = () => <LeadGenHubPage view="campaigns" />;
export const LeadGenFormsPage = () => <LeadGenHubPage view="forms" />;
export const LeadGenAutomationsPage = () => <LeadGenHubPage view="automations" />;
export const LeadGenSequencesPage = () => <LeadGenHubPage view="sequences" />;
export const LeadGenIntegrationsPage = () => <LeadGenHubPage view="integrations" />;

export default LeadGenHubPage;
