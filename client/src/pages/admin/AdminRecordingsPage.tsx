import React, { FC, useEffect, useMemo, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard } from '../../components/DashboardPrimitives';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';
import { triggerMightyCallRecordingsSync } from '../../lib/apiClient';

type Recording = {
  id: string;
  org_id: string;
  from_number?: string | null;
  to_number?: string | null;
  duration_seconds?: number | null;
  duration?: number | null;
  recording_date?: string | null;
  created_at?: string | null;
  recording_url?: string | null;
  organizations?: { name: string; id: string };
};

type Org = { id: string; name: string };

const PAGE_SIZE = 500;

function isoDateDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function fmtDate(v?: string | null) {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function secondsOf(r: Recording) {
  return Number(r.duration_seconds ?? r.duration ?? 0) || 0;
}

function fmtDuration(s: number) {
  if (!s) return '0s';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

const AdminRecordingsPage: FC = () => {
  const { user, selectedOrgId } = useAuth();
  const userId = user?.id;

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filterOrgId, setFilterOrgId] = useState('');
  const [search, setSearch] = useState('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [syncing, setSyncing] = useState(false);

  const filteredRows = useMemo(() => {
    const q = search.trim();
    if (!q) return recordings;
    return recordings.filter((r) => {
      const from = String(r.from_number || '');
      const to = String(r.to_number || '');
      return from.includes(q) || to.includes(q) || String(r.organizations?.name || '').toLowerCase().includes(q.toLowerCase());
    });
  }, [recordings, search]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const totalSeconds = filteredRows.reduce((a, r) => a + secondsOf(r), 0);
    const avgSeconds = total > 0 ? Math.round(totalSeconds / total) : 0;
    return { total, totalSeconds, avgSeconds };
  }, [filteredRows]);

  const fetchOrgs = async () => {
    if (!userId) return;
    try {
      const response = await fetch(buildApiUrl('/api/admin/orgs'), { headers: { 'x-user-id': userId } });
      if (!response.ok) return;
      const data = await response.json();
      setOrgs(data.orgs || []);
    } catch {}
  };

  useEffect(() => {
    if (filterOrgId) return;
    if (selectedOrgId) {
      setFilterOrgId(selectedOrgId);
      return;
    }
    if (orgs.length > 0) {
      setFilterOrgId(orgs[0].id);
    }
  }, [selectedOrgId, orgs, filterOrgId]);

  const syncRecentRecordings = async () => {
    if (!userId || !filterOrgId) return;
    setSyncing(true);
    try {
      await triggerMightyCallRecordingsSync(filterOrgId, isoDateDaysAgo(2), new Date().toISOString().slice(0, 10), userId);
    } catch (e: any) {
      console.warn('[AdminRecordingsPage] recent MightyCall sync failed:', e?.message || e);
    } finally {
      setSyncing(false);
    }
  };

  const loadRecordings = async (reset = false, options?: { syncFirst?: boolean }) => {
    const activeOffset = reset ? 0 : (nextOffset ?? 0);
    if (!userId) return;
    if (!reset && nextOffset == null) return;

    try {
      if (reset) {
        setLoading(true);
        setListError(null);
      } else {
        setLoadingMore(true);
      }

      if (reset && options?.syncFirst && filterOrgId) {
        await syncRecentRecordings();
      }

      let url = buildApiUrl(`/api/mightycall/recordings?limit=${PAGE_SIZE}&offset=${activeOffset}`);
      if (filterOrgId) url += `&org_id=${encodeURIComponent(filterOrgId)}`;

      const response = await fetch(url, { headers: { 'x-user-id': userId, 'Content-Type': 'application/json' } });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setListError(err?.detail || err?.error || 'Failed to load recordings');
        return;
      }

      const data = await response.json();
      const rows: Recording[] = data.recordings || [];
      setRecordings((prev) => (reset ? rows : [...prev, ...rows]));
      setNextOffset(data.next_offset ?? null);
    } catch (e: any) {
      setListError(e?.message || 'Failed to load recordings');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  const handlePlay = async (recording: Recording) => {
    if (!userId) return;
    try {
      const response = await fetch(buildApiUrl(`/api/recordings/${recording.id}/download`), {
        headers: { 'x-user-id': userId, 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setListError(err?.detail || err?.error || 'Failed to open recording');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      setListError(e?.message || 'Failed to open recording');
    }
  };

  useEffect(() => { fetchOrgs(); }, [userId]);
  useEffect(() => { loadRecordings(true, { syncFirst: true }); }, [filterOrgId, userId]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const interval = setInterval(() => loadRecordings(true, { syncFirst: true }), 10000);
    return () => clearInterval(interval);
  }, [autoRefreshEnabled, filterOrgId, userId]);

  return (
    <PageLayout
      eyebrow="Admin recordings"
      title="Recordings"
      description="Cross-organization recording review with playback access and queue-quality visibility."
      actions={<button onClick={() => loadRecordings(true, { syncFirst: true })} disabled={loading || syncing} className="vs-button-secondary">{loading || syncing ? 'Refreshing...' : 'Refresh'}</button>}
    >
      <div className="space-y-6">
        <AdminTopNav />

        <SectionCard title="Recording filters" description="Search by number, narrow by organization, and optionally watch for new rows.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,240px),minmax(0,240px),1fr] md:items-end">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Organization</label>
              <select value={filterOrgId} onChange={(e) => setFilterOrgId(e.target.value)} className="vs-input w-full">
                <option value="">All Organizations</option>
                {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Search Number</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="+1212..." className="vs-input w-full" />
            </div>
            <label className="flex items-center justify-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
              <input type="checkbox" checked={autoRefreshEnabled} onChange={(e) => setAutoRefreshEnabled(e.target.checked)} />
              {syncing ? 'Syncing recent MightyCall recordings...' : 'Auto-refresh every 10 seconds'}
            </label>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricStatCard label="Recordings" value={summary.total} />
          <MetricStatCard label="Total Duration" value={fmtDuration(summary.totalSeconds)} />
          <MetricStatCard label="Average Duration" value={fmtDuration(summary.avgSeconds)} accent="cyan" />
        </div>

        <SectionCard title="Recording inventory" description="A cross-client list of recording rows available for review." contentClassName="p-0">
          {listError ? (
            <div className="px-5 py-10 text-sm text-rose-300">{listError}</div>
          ) : loading ? (
            <div className="px-5 py-10 text-sm text-slate-400">Loading recordings...</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-5"><EmptyStatePanel title="No recordings found" description="No recording rows matched the current admin filters." /></div>
          ) : (
            <div className="max-h-[72vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-white/8 bg-[rgba(2,6,23,0.96)] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Organization</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">From</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">To</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {filteredRows.map((r) => (
                    <tr key={r.id} className="transition hover:bg-white/[0.03]">
                      <td className="px-4 py-3 text-slate-200">{r.organizations?.name || r.org_id}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{r.from_number || '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{r.to_number || '-'}</td>
                      <td className="px-4 py-3 text-slate-300">{fmtDuration(secondsOf(r))}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(r.recording_date || r.created_at)}</td>
                      <td className="px-4 py-3">
                        {r.recording_url ? (
                          <button onClick={() => handlePlay(r)} className="vs-button-secondary !px-3 !py-1.5 !text-xs">Play</button>
                        ) : (
                          <span className="text-xs text-slate-500">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {nextOffset !== null && (
                <div className="flex justify-center border-t border-white/8 p-4">
                  <button onClick={() => loadRecordings(false)} disabled={loadingMore} className="vs-button-secondary">
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
};

export default AdminRecordingsPage;
