import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';
import { PageLayout } from '../components/PageLayout';

type Recording = {
  id: string;
  org_id: string;
  from_number?: string | null;
  to_number?: string | null;
  duration_seconds?: number | null;
  duration?: number | null;
  recording_date?: string | null;
  recording_url?: string | null;
  created_at?: string | null;
};

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

export function RecordingsPage() {
  const { user, orgs, selectedOrgId, setSelectedOrgId } = useAuth();
  const { org: currentOrg } = useOrg();
  const orgId =
    selectedOrgId ||
    currentOrg?.id ||
    (orgs && orgs.length > 0 ? orgs[0].id : null) ||
    ((user?.user_metadata as any)?.org_id ?? null);
  const orgName =
    (orgs.find((o) => o.id === orgId)?.name) ||
    currentOrg?.name ||
    'your organization';

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(0);

  const filteredRows = useMemo(() => {
    const q = search.trim();
    if (!q) return recordings;
    return recordings.filter((r) => String(r.from_number || '').includes(q) || String(r.to_number || '').includes(q));
  }, [recordings, search]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const totalSeconds = filteredRows.reduce((a, r) => a + secondsOf(r), 0);
    const avgSeconds = total > 0 ? Math.round(totalSeconds / total) : 0;
    return { total, totalSeconds, avgSeconds };
  }, [filteredRows]);

  const fetchRecordings = async (reset = true) => {
    if (!orgId || !user) return;
    if (!reset && nextOffset == null) return;

    const activeOffset = reset ? 0 : (nextOffset ?? 0);

    try {
      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const response = await fetch(buildApiUrl(`/api/mightycall/recordings?org_id=${encodeURIComponent(orgId)}&limit=500&offset=${activeOffset}`), {
        headers: { 'x-user-id': user.id, 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body?.detail || body?.error || 'Failed to fetch recordings');
        return;
      }

      const data = await response.json();
      const rows = data.recordings || [];
      setRecordings((prev) => (reset ? rows : [...prev, ...rows]));
      setNextOffset(data.next_offset ?? null);
    } catch (err: any) {
      setError(err?.message || 'Error fetching recordings');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (orgId && user) fetchRecordings(true);
  }, [orgId, user?.id]);

  useEffect(() => {
    // If auth already has orgs but selected org is empty, default to first org for client UX.
    if (!selectedOrgId && orgs && orgs.length > 0) {
      setSelectedOrgId(orgs[0].id);
    }
  }, [selectedOrgId, orgs, setSelectedOrgId]);

  const handleDownload = async (recording: Recording) => {
    try {
      const response = await fetch(buildApiUrl(`/api/recordings/${recording.id}/download`), {
        headers: { 'x-user-id': user?.id || '', 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        setError('Failed to download recording');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${recording.id}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: any) {
      setError(err?.message || 'Error downloading recording');
    }
  };

  if (!orgId) {
    return (
      <PageLayout title="Recordings" description="No organization selected">
        <div className="vs-surface p-6 text-slate-300">No organization is linked to this account yet. Ask your org admin to assign your account to an organization.</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Recordings" description={`Organized recording history for ${orgName}`}>
      <div className="space-y-6">
        <section className="vs-surface p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-2">Search Number</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="+1212..." className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" />
            </div>
            <div className="text-xs text-slate-400">Scope: assigned numbers only</div>
            <button onClick={() => fetchRecordings(true)} disabled={loading} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60">{loading ? 'Refreshing...' : 'Refresh'}</button>
          </div>
        </section>

        {error && <div className="vs-surface border border-rose-500/40 bg-rose-900/20 p-3 text-sm text-rose-200">{error}</div>}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="vs-surface p-4"><div className="text-xs text-slate-400">Recordings</div><div className="text-2xl text-white font-bold">{summary.total}</div></div>
          <div className="vs-surface p-4"><div className="text-xs text-slate-400">Total Duration</div><div className="text-2xl text-white font-bold">{fmtDuration(summary.totalSeconds)}</div></div>
          <div className="vs-surface p-4"><div className="text-xs text-slate-400">Average Duration</div><div className="text-2xl text-cyan-300 font-bold">{fmtDuration(summary.avgSeconds)}</div></div>
        </section>

        <section className="vs-surface p-0 overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-200">Recording List</div>
          {loading ? (
            <div className="px-4 py-8 text-sm text-slate-400">Loading recordings...</div>
          ) : filteredRows.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-400">No recordings found.</div>
          ) : (
            <div className="max-h-[72vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="text-left py-2 px-3">From</th>
                    <th className="text-left py-2 px-3">To</th>
                    <th className="text-left py-2 px-3">Duration</th>
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-left py-2 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRows.map((recording) => (
                    <tr key={recording.id} className="hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-mono text-xs text-slate-200">{recording.from_number || '-'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-200">{recording.to_number || '-'}</td>
                      <td className="px-3 py-2 text-slate-300">{fmtDuration(secondsOf(recording))}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{fmtDate(recording.recording_date || recording.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {recording.recording_url ? (
                            <a href={recording.recording_url} target="_blank" rel="noopener noreferrer" className="rounded border border-cyan-500/40 bg-cyan-900/20 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-900/30">Play</a>
                          ) : <span className="text-xs text-slate-500">N/A</span>}
                          <button onClick={() => handleDownload(recording)} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">Download</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {nextOffset !== null && (
                <div className="p-3 border-t border-slate-800 flex justify-center">
                  <button onClick={() => fetchRecordings(false)} disabled={loadingMore} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-60">{loadingMore ? 'Loading...' : 'Load more'}</button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </PageLayout>
  );
}

export default RecordingsPage;
