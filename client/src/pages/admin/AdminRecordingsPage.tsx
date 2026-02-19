import React, { FC, useEffect, useMemo, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';

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
  const { user } = useAuth();
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
      const response = await fetch(buildApiUrl('/api/admin/orgs'), { headers: { 'x-user-id': userId, 'x-dev-bypass': 'true' } });
      if (!response.ok) return;
      const data = await response.json();
      setOrgs(data.orgs || []);
    } catch {}
  };

  const loadRecordings = async (reset = false) => {
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

  useEffect(() => { fetchOrgs(); }, [userId]);
  useEffect(() => { loadRecordings(true); }, [filterOrgId, userId]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const interval = setInterval(() => loadRecordings(true), 10000);
    return () => clearInterval(interval);
  }, [autoRefreshEnabled, filterOrgId, userId]);

  return (
    <PageLayout title="Recordings" description="Organized recordings view with numbers, durations, and direct actions">
      <div className="space-y-6">
        <AdminTopNav />

        <section className="vs-surface p-5">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-2">Organization</label>
              <select value={filterOrgId} onChange={(e) => setFilterOrgId(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                <option value="">All Organizations</option>
                {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-2">Search Number</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="+1212..." className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
            </div>
            <button onClick={() => loadRecordings(true)} disabled={loading} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60">{loading ? 'Refreshing...' : 'Refresh'}</button>
            <label className="flex items-center justify-end gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={autoRefreshEnabled} onChange={(e) => setAutoRefreshEnabled(e.target.checked)} />
              Auto-refresh 10s
            </label>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="vs-surface p-4"><div className="text-xs text-slate-400">Recordings</div><div className="text-2xl text-white font-bold">{summary.total}</div></div>
          <div className="vs-surface p-4"><div className="text-xs text-slate-400">Total Duration</div><div className="text-2xl text-white font-bold">{fmtDuration(summary.totalSeconds)}</div></div>
          <div className="vs-surface p-4"><div className="text-xs text-slate-400">Average Duration</div><div className="text-2xl text-cyan-300 font-bold">{fmtDuration(summary.avgSeconds)}</div></div>
        </section>

        <section className="vs-surface p-0 overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-200">Recording List</div>

          {listError ? (
            <div className="px-4 py-8 text-sm text-rose-300">{listError}</div>
          ) : loading ? (
            <div className="px-4 py-8 text-sm text-slate-400">Loading recordings...</div>
          ) : filteredRows.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-400">No recordings found.</div>
          ) : (
            <div className="max-h-[72vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="text-left py-2 px-3">Organization</th>
                    <th className="text-left py-2 px-3">From</th>
                    <th className="text-left py-2 px-3">To</th>
                    <th className="text-left py-2 px-3">Duration</th>
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-left py-2 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/40">
                      <td className="px-3 py-2 text-slate-200">{r.organizations?.name || r.org_id}</td>
                      <td className="px-3 py-2 text-xs font-mono text-slate-200">{r.from_number || '-'}</td>
                      <td className="px-3 py-2 text-xs font-mono text-slate-200">{r.to_number || '-'}</td>
                      <td className="px-3 py-2 text-slate-300">{fmtDuration(secondsOf(r))}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{fmtDate(r.recording_date || r.created_at)}</td>
                      <td className="px-3 py-2">
                        {r.recording_url ? (
                          <a href={r.recording_url} target="_blank" rel="noopener noreferrer" className="rounded border border-cyan-500/40 bg-cyan-900/20 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-900/30">Play</a>
                        ) : (
                          <span className="text-xs text-slate-500">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {nextOffset !== null && (
                <div className="p-3 border-t border-slate-800 flex justify-center">
                  <button onClick={() => loadRecordings(false)} disabled={loadingMore} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-60">{loadingMore ? 'Loading...' : 'Load more'}</button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </PageLayout>
  );
};

export default AdminRecordingsPage;
