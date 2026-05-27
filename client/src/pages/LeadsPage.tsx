import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageLayout from '../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getLeads, getLeadsSummary, LeadItem, updateLead } from '../lib/apiClient';
import { postLog } from '../lib/logging';
import { supabase } from '../lib/supabaseClient';

type DateRange = 'today' | 'yesterday' | '7d' | 'custom';

const statusOptions = [
  'new',
  'contacted',
  'qualified',
  'transferred',
  'not_interested',
  'no_answer',
  'callback',
];

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function dateParams(range: DateRange, customStart: string, customEnd: string) {
  const now = new Date();
  if (range === 'today') return { start_date: startOfDay(now).toISOString(), end_date: endOfDay(now).toISOString() };
  if (range === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { start_date: startOfDay(y).toISOString(), end_date: endOfDay(y).toISOString() };
  }
  if (range === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { start_date: startOfDay(start).toISOString(), end_date: endOfDay(now).toISOString() };
  }
  return {
    start_date: customStart ? new Date(`${customStart}T00:00:00`).toISOString() : undefined,
    end_date: customEnd ? new Date(`${customEnd}T23:59:59`).toISOString() : undefined,
  };
}

function formatMoney(value: unknown) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return '-';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

function formatTimeAgo(value?: string | null) {
  if (!value) return '-';
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(value).toLocaleString();
}

function leadName(lead: LeadItem) {
  const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
  return name || 'Unknown lead';
}

function maskPhone(phone: string, revealed: boolean) {
  if (revealed) return phone;
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length <= 4) return phone || '-';
  return `***-***-${digits.slice(-4)}`;
}

function statusTone(status?: string | null): 'neutral' | 'success' | 'warning' | 'info' {
  if (status === 'transferred' || status === 'qualified') return 'success';
  if (status === 'contacted' || status === 'callback') return 'warning';
  if (status === 'new') return 'info';
  return 'neutral';
}

export default function LeadsPage() {
  const { user, selectedOrgId, orgs, globalRole } = useAuth();
  const toast = useToast();
  const isAdmin = ['platform_admin', 'admin', 'super_admin'].includes(String(globalRole || ''));
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);
  const [latestLead, setLatestLead] = useState<LeadItem | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [revealedPhones, setRevealedPhones] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');
  const [range, setRange] = useState<DateRange>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState(selectedOrgId || '');

  useEffect(() => {
    setOrgFilter(selectedOrgId || '');
  }, [selectedOrgId]);

  const queryParams = useMemo(() => {
    const params: Record<string, string | undefined> = {
      organization_id: orgFilter || undefined,
      status: status || undefined,
      state: stateFilter || undefined,
      agent_id: agentFilter || undefined,
      search: search || undefined,
      limit: '100',
      ...dateParams(range, customStart, customEnd),
    };
    return params;
  }, [agentFilter, customEnd, customStart, orgFilter, range, search, stateFilter, status]);

  const loadLeads = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [leadResult, summaryResult] = await Promise.all([
        getLeads(queryParams, user.id),
        getLeadsSummary({ organization_id: orgFilter || undefined }, user.id),
      ]);
      setLeads(leadResult.items || []);
      setSummary(summaryResult);
    } catch (e: any) {
      setError(e?.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [orgFilter, queryParams, user?.id]);

  useEffect(() => {
    void loadLeads();
    const id = window.setInterval(() => void loadLeads(), 10_000);
    return () => window.clearInterval(id);
  }, [loadLeads]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('victorysync-leads-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        const lead = payload.new as LeadItem;
        if (orgFilter && lead.organization_id !== orgFilter) return;
        setLeads((prev) => [lead, ...prev.filter((item) => item.id !== lead.id)].slice(0, 100));
        setLatestLead(lead);
        setHighlightedIds((prev) => new Set(prev).add(lead.id));
        window.setTimeout(() => setHighlightedIds((prev) => {
          const next = new Set(prev);
          next.delete(lead.id);
          return next;
        }), 5000);
        toast.push(`New lead received - ${leadName(lead)}${lead.state ? ` from ${lead.state}` : ''}`, 'success');
        postLog('/api/logs/activity', {
          event_type: 'notification',
          event_name: 'New lead notification delivered',
          page: '/dashboard/leads',
          element: 'new-lead-banner',
          metadata: { lead_id: lead.id, source: lead.source },
        });
        void loadLeads();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        const lead = payload.new as LeadItem;
        setLeads((prev) => prev.map((item) => item.id === lead.id ? lead : item));
        setSelectedLead((current) => current?.id === lead.id ? lead : current);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadLeads, orgFilter, toast, user?.id]);

  const updateSelected = async (lead: LeadItem, patch: Record<string, any>) => {
    if (!user?.id) return;
    const result = await updateLead(lead.id, patch, user.id);
    setLeads((prev) => prev.map((item) => item.id === lead.id ? result.item : item));
    setSelectedLead(result.item);
  };

  const onCallLead = async (lead: LeadItem) => {
    await updateSelected(lead, { assign_to_me: true, increment_attempts: true });
    window.location.href = `tel:${lead.phone}`;
  };

  const statCards = [
    ['Total today', summary?.total_today ?? 0, 'All received leads'],
    ['New', summary?.new_leads ?? 0, 'Uncontacted'],
    ['Contacted', summary?.contacted_today ?? 0, 'Reached today'],
    ['Transferred', summary?.transferred_today ?? 0, 'Sent to client'],
    ['Contact rate', `${summary?.contact_rate_pct ?? 0}%`, 'Contacted / total'],
    ['Transfer rate', `${summary?.transfer_rate_pct ?? 0}%`, 'Transferred / contacted'],
  ];

  return (
    <PageLayout
      eyebrow="Lead Intake"
      title="Leads"
      description="Live McGraw Now leads routed by campaign and organization."
      actions={<button className="vs-button-secondary" onClick={() => void loadLeads()} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>}
    >
      {latestLead && (
        <div className="mb-5 rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.08] p-4 shadow-[0_16px_38px_rgba(2,6,23,0.18)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-emerald-100">New lead just came in</div>
              <div className="mt-1 text-sm text-emerald-200/80">
                {leadName(latestLead)}, {latestLead.state || 'Unknown state'}, {formatMoney(latestLead.debt_amount)} debt
              </div>
            </div>
            <div className="flex gap-2">
              <button className="vs-button-primary" onClick={() => void onCallLead(latestLead)} data-log="Call newest lead">Call Now</button>
              <button className="vs-button-secondary" onClick={() => setLatestLead(null)} data-log="Dismiss new lead banner">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {statCards.map(([label, value, hint], index) => (
          <MetricStatCard key={String(label)} label={String(label)} value={value} hint={hint} accent={index === 0 ? 'cyan' : index === 3 ? 'emerald' : 'neutral'} />
        ))}
      </div>

      <SectionCard title="Filters" className="mt-5" contentClassName="p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
          {isAdmin && (
            <select className="vs-input xl:col-span-2" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
              <option value="">All organizations</option>
              {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          )}
          <select className="vs-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statusOptions.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="vs-input" value={range} onChange={(e) => setRange(e.target.value as DateRange)}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 days</option>
            <option value="custom">Custom</option>
          </select>
          {range === 'custom' && (
            <>
              <input className="vs-input" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <input className="vs-input" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </>
          )}
          <input className="vs-input" value={stateFilter} onChange={(e) => setStateFilter(e.target.value.toUpperCase())} placeholder="State" maxLength={20} />
          {isAdmin && <input className="vs-input" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} placeholder="Agent user ID" />}
          <input className="vs-input xl:col-span-2" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone" />
          <button className="vs-button-primary" onClick={() => void loadLeads()}>Apply</button>
          <button className="vs-button-secondary" onClick={() => { setStatus(''); setRange('today'); setCustomStart(''); setCustomEnd(''); setStateFilter(''); setAgentFilter(''); setSearch(''); }}>Reset</button>
        </div>
      </SectionCard>

      <SectionCard title="Live Leads" description="New rows appear automatically from Supabase Realtime." className="mt-5" contentClassName="p-0">
        {error && <div className="m-5 rounded-2xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-200">{error}</div>}
        {!loading && leads.length === 0 ? (
          <div className="p-5">
            <EmptyStatePanel title="No leads found" description="When McGraw Now posts a lead to /api/leads/inbound, it will appear here for the assigned organization." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/[0.04] text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-5 py-3">Received</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">State</th>
                  <th className="px-5 py-3">Debt</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Agent</th>
                  <th className="px-5 py-3">Attempts</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.035]">
                {leads.map((lead) => {
                  const revealed = revealedPhones.has(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`cursor-pointer transition ${highlightedIds.has(lead.id) ? 'bg-emerald-400/[0.08]' : 'hover:bg-white/[0.025]'}`}
                    >
                      <td className="px-5 py-4 text-slate-300">{formatTimeAgo(lead.received_at)}</td>
                      <td className="px-5 py-4 font-medium text-white">{leadName(lead)}</td>
                      <td className="px-5 py-4 text-slate-300">
                        <span>{maskPhone(lead.phone, revealed || isAdmin)}</span>
                        {!isAdmin && !revealed && (
                          <button className="ml-2 text-xs text-cyan-200" onClick={(e) => { e.stopPropagation(); setRevealedPhones((prev) => new Set(prev).add(lead.id)); }}>
                            reveal
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-300">{lead.state || '-'}</td>
                      <td className="px-5 py-4 text-slate-300">{formatMoney(lead.debt_amount)}</td>
                      <td className="px-5 py-4"><StatusBadge tone={statusTone(lead.status)}>{String(lead.status || 'new').replace(/_/g, ' ')}</StatusBadge></td>
                      <td className="px-5 py-4 text-slate-400">{lead.assigned_agent_id ? lead.assigned_agent_id.slice(0, 8) : '-'}</td>
                      <td className="px-5 py-4 text-slate-300">{lead.call_attempts || 0}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <button className="vs-button-primary" onClick={(e) => { e.stopPropagation(); void onCallLead(lead); }} data-log="Call lead">Call</button>
                          <button className="vs-button-secondary" onClick={(e) => { e.stopPropagation(); void updateSelected(lead, { assign_to_me: true }); }} data-log="Assign lead to me">Assign</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {selectedLead && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm" onClick={() => setSelectedLead(null)}>
          <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-white/[0.04] bg-slate-950 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Lead detail</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">{leadName(selectedLead)}</h2>
                <p className="mt-1 text-sm text-slate-400">{selectedLead.source || 'mcgrawnow'} {selectedLead.source_lead_id ? `- ${selectedLead.source_lead_id}` : ''}</p>
              </div>
              <button className="vs-button-secondary" onClick={() => setSelectedLead(null)}>Close</button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Info label="Phone" value={selectedLead.phone} />
              <Info label="Email" value={selectedLead.email || '-'} />
              <Info label="State" value={selectedLead.state || '-'} />
              <Info label="Debt" value={formatMoney(selectedLead.debt_amount)} />
              <Info label="TCPA consent" value={selectedLead.tcpa_consent ? 'Yes' : 'No'} />
              <Info label="TCPA timestamp" value={selectedLead.tcpa_timestamp ? new Date(selectedLead.tcpa_timestamp).toLocaleString() : '-'} />
              <Info label="Received" value={selectedLead.received_at ? new Date(selectedLead.received_at).toLocaleString() : '-'} />
              <Info label="Call attempts" value={String(selectedLead.call_attempts || 0)} />
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">Status</span>
                <select className="vs-input w-full" value={selectedLead.status || 'new'} onChange={(e) => void updateSelected(selectedLead, { status: e.target.value })}>
                  {statusOptions.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">Notes</span>
                <textarea className="vs-input min-h-[120px] w-full" value={selectedLead.notes || ''} onChange={(e) => setSelectedLead({ ...selectedLead, notes: e.target.value })} onBlur={() => void updateSelected(selectedLead, { notes: selectedLead.notes || '' })} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="vs-button-primary" onClick={() => void onCallLead(selectedLead)} data-log="Call lead from drawer">Call Now</button>
                <button className="vs-button-secondary" onClick={() => void updateSelected(selectedLead, { assign_to_me: true })}>Assign to Me</button>
                <button className="vs-button-secondary" onClick={() => void updateSelected(selectedLead, { status: 'transferred' })}>Mark Transferred</button>
              </div>
            </div>

            {isAdmin && (
              <details className="mt-6 rounded-3xl border border-white/[0.04] bg-white/[0.025] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-200">Raw payload</summary>
                <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-black/30 p-4 text-xs text-slate-300">{JSON.stringify(selectedLead.raw_payload || {}, null, 2)}</pre>
              </details>
            )}
          </aside>
        </div>
      )}
    </PageLayout>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.03] bg-white/[0.025] p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 break-words text-sm font-medium text-slate-100">{value}</div>
    </div>
  );
}
