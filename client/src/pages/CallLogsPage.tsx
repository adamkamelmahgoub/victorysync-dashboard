import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { getCallLogs } from '../lib/apiClient';
import AdminTopNav from '../components/AdminTopNav';

type CallLogItem = {
  id: string;
  org_id?: string | null;
  org_name?: string | null;
  direction?: string | null;
  status?: string | null;
  from_number?: string | null;
  to_number?: string | null;
  queue_name?: string | null;
  started_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  agent_name?: string | null;
  agent_extension?: string | null;
};

function fmtDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function fmtDuration(seconds?: number | null) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}m ${remainder}s`;
}

const PAGE_SIZE = 50;

export default function CallLogsPage() {
  const { user, globalRole, selectedOrgId, setSelectedOrgId, orgs } = useAuth();
  const isAdmin = globalRole === 'platform_admin';
  const activeOrgId = isAdmin ? selectedOrgId : (selectedOrgId || orgs[0]?.id || null);

  const [items, setItems] = useState<CallLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [search, setSearch] = useState('');

  const load = async (reset = false) => {
    if (!user?.id) return;
    if (!reset && nextOffset == null) return;
    try {
      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      const json = await getCallLogs({
        orgId: activeOrgId,
        limit: PAGE_SIZE,
        offset: reset ? 0 : (nextOffset ?? 0),
        q: search.trim() || undefined,
      }, user.id);
      const rows = (json.items || []) as CallLogItem[];
      setItems((previous) => (reset ? rows : [...previous, ...rows]));
      setNextOffset(json.next_offset ?? null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load call logs');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    load(true);
  }, [user?.id, activeOrgId, search]);

  const summary = useMemo(() => {
    const answered = items.filter((item) => String(item.status || '').toLowerCase().includes('answer')).length;
    const missed = items.filter((item) => String(item.status || '').toLowerCase().includes('miss')).length;
    const inbound = items.filter((item) => String(item.direction || '').toLowerCase() === 'inbound').length;
    return { answered, missed, inbound };
  }, [items]);

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {isAdmin && (
        <select
          value={selectedOrgId ?? ''}
          onChange={(e) => setSelectedOrgId(e.target.value || null)}
          className="vs-input min-w-[220px]"
        >
          <option value="">All organizations</option>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
      )}
      <button onClick={() => load(true)} disabled={loading} className="vs-button-secondary">
        {loading ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  );

  const selectedOrgName = activeOrgId ? orgs.find((org) => org.id === activeOrgId)?.name || 'Selected organization' : 'All organizations';

  return (
    <PageLayout
      eyebrow="Call activity"
      title="Call logs"
      description={isAdmin ? 'Review call traffic across organizations or narrow the list to one workspace.' : 'Review call traffic for your assigned numbers only.'}
      actions={actions}
    >
      <div className="space-y-6">
        {isAdmin && <AdminTopNav />}

        {error && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricStatCard label="Calls" value={items.length} hint={selectedOrgName} />
          <MetricStatCard label="Answered" value={summary.answered} hint="Detected from status labels" accent="emerald" />
          <MetricStatCard label="Missed" value={summary.missed} hint="Calls needing attention" accent="amber" />
          <MetricStatCard label="Inbound" value={summary.inbound} hint="Inbound volume in current view" accent="cyan" />
        </div>

        <SectionCard title="Filters" description={isAdmin ? 'Search all visible calls by number, status, queue, or agent extension.' : 'Only calls touching your assigned numbers are returned here.'}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr),auto]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search numbers, status, queue, or extension"
              className="vs-input w-full"
            />
            <div className="vs-surface-muted flex items-center justify-center px-4 py-3 text-sm text-slate-400">
              {items.length} visible call{items.length === 1 ? '' : 's'}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Call log stream" description="A clean, paginated timeline of recent calls.">
          {loading && items.length === 0 ? (
            <div className="text-sm text-slate-400">Loading call logs...</div>
          ) : items.length === 0 ? (
            <EmptyStatePanel
              title="No calls found"
              description={isAdmin ? 'No calls matched the current admin scope.' : 'No calls matched your assigned numbers yet.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/8 text-slate-500">
                  <tr>
                    {isAdmin && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Organization</th>}
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Direction</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">From</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">To</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Agent</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Queue</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-white/[0.03]">
                      {isAdmin && <td className="px-4 py-3 text-slate-300">{item.org_name || item.org_id || '-'}</td>}
                      <td className="px-4 py-3">
                        <StatusBadge tone={String(item.direction || '').toLowerCase() === 'inbound' ? 'info' : 'success'}>
                          {item.direction || '-'}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{item.from_number || '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{item.to_number || '-'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={String(item.status || '').toLowerCase().includes('miss') ? 'warning' : 'neutral'}>
                          {item.status || '-'}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{item.agent_name || (item.agent_extension ? `Ext ${item.agent_extension}` : '-')}</td>
                      <td className="px-4 py-3 text-slate-400">{item.queue_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-300">{fmtDuration(item.duration_seconds)}</td>
                      <td className="px-4 py-3 text-slate-400">{fmtDateTime(item.started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {nextOffset !== null && (
                <div className="flex justify-center border-t border-white/8 p-4">
                  <button onClick={() => load(false)} disabled={loadingMore} className="vs-button-secondary">
                    {loadingMore ? 'Loading more...' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </PageLayout>
  );
}
