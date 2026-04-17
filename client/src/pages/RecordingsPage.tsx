import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard } from '../components/DashboardPrimitives';

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
  const { user, orgs, selectedOrgId } = useAuth();
  const { org: currentOrg } = useOrg();
  const orgId =
    ((user?.user_metadata as any)?.org_id ?? null) ||
    selectedOrgId ||
    currentOrg?.id ||
    null;
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
    if (!user) return;
    if (!reset && nextOffset == null) return;

    const activeOffset = reset ? 0 : (nextOffset ?? 0);

    try {
      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const q = new URLSearchParams();
      q.set('limit', '500');
      q.set('offset', String(activeOffset));
      if (orgId) q.set('org_id', orgId);
      const response = await fetch(buildApiUrl(`/api/mightycall/recordings?${q.toString()}`), {
        headers: { 'x-user-id': user.id, 'Content-Type': 'application/json' },
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
    if (user) fetchRecordings(true);
  }, [orgId, user?.id]);

  const handleDownload = async (recording: Recording) => {
    try {
      const response = await fetch(buildApiUrl(`/api/recordings/${recording.id}/download`), {
        headers: { 'x-user-id': user?.id || '', 'Content-Type': 'application/json' },
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

  if (!orgId && (!orgs || orgs.length === 0)) {
    return (
      <PageLayout eyebrow="Recordings" title="Recordings" description="No organization selected">
        <EmptyStatePanel title="No organization linked" description="Ask your org admin to assign your account to an organization before reviewing recordings." />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      eyebrow="Quality review"
      title="Recordings"
      description={`Organized recording history, playback, and download actions for ${orgName}.`}
      actions={<button onClick={() => fetchRecordings(true)} disabled={loading} className="vs-button-secondary">{loading ? 'Refreshing...' : 'Refresh'}</button>}
    >
      <div className="space-y-6">
        <SectionCard title="Recording filters" description="Search recording activity by the numbers involved.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,320px),1fr] md:items-end">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Search Number</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="+1212..." className="vs-input w-full" />
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">Scope: assigned numbers only</div>
          </div>
        </SectionCard>

        {error && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricStatCard label="Recordings" value={summary.total} />
          <MetricStatCard label="Total Duration" value={fmtDuration(summary.totalSeconds)} />
          <MetricStatCard label="Average Duration" value={fmtDuration(summary.avgSeconds)} accent="cyan" />
        </div>

        <SectionCard title="Recording list" description="Review call recordings with direct playback and download actions." contentClassName="p-0">
          {loading ? (
            <div className="px-5 py-10 text-sm text-slate-400">Loading recordings...</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-5"><EmptyStatePanel title="No recordings found" description="No recording rows matched the current organization and search criteria." /></div>
          ) : (
            <div className="max-h-[72vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-white/8 bg-[rgba(2,6,23,0.96)] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">From</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">To</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {filteredRows.map((recording) => (
                    <tr key={recording.id} className="transition hover:bg-white/[0.03]">
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{recording.from_number || '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{recording.to_number || '-'}</td>
                      <td className="px-4 py-3 text-slate-300">{fmtDuration(secondsOf(recording))}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(recording.recording_date || recording.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {recording.recording_url ? (
                            <a href={recording.recording_url} target="_blank" rel="noopener noreferrer" className="vs-button-secondary !px-3 !py-1.5 !text-xs">Play</a>
                          ) : <span className="text-xs text-slate-500">N/A</span>}
                          <button onClick={() => handleDownload(recording)} className="vs-button-secondary !px-3 !py-1.5 !text-xs">Download</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {nextOffset !== null && (
                <div className="flex justify-center border-t border-white/8 p-4">
                  <button onClick={() => fetchRecordings(false)} disabled={loadingMore} className="vs-button-secondary">
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

export default RecordingsPage;
