import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard } from '../components/DashboardPrimitives';
import { triggerMightyCallRecordingsSync } from '../lib/apiClient';

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

export function RecordingsPage() {
  const { user, orgs, selectedOrgId, globalRole } = useAuth();
  const { org: currentOrg } = useOrg();
  const isPlatformAdmin = globalRole === 'platform_admin' || globalRole === 'admin';
  const orgId = isPlatformAdmin
    ? (selectedOrgId || null)
    : (((user?.user_metadata as any)?.org_id ?? null) || selectedOrgId || currentOrg?.id || null);
  const orgName =
    orgId
      ? ((orgs.find((o) => o.id === orgId)?.name) || currentOrg?.name || 'your organization')
      : 'all organizations';

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [syncing, setSyncing] = useState(false);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(isoDateDaysAgo(30));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [playbackUrls, setPlaybackUrls] = useState<Record<string, string>>({});
  const playbackUrlsRef = useRef<Record<string, string>>({});

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

  const syncRecentRecordings = async () => {
    if (!user?.id || !orgId) return;
    setSyncing(true);
    try {
      await triggerMightyCallRecordingsSync(orgId, isoDateDaysAgo(180), new Date().toISOString().slice(0, 10), user.id);
    } catch (e: any) {
      console.warn('[RecordingsPage] recent MightyCall sync failed:', e?.message || e);
    } finally {
      setSyncing(false);
    }
  };

  const fetchRecordings = async (reset = true, options?: { syncFirst?: boolean }) => {
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

      if (reset && options?.syncFirst && orgId) {
        await syncRecentRecordings();
      }

      const q = new URLSearchParams();
	      q.set('limit', '500');
	      q.set('offset', String(activeOffset));
	      if (orgId) q.set('org_id', orgId);
	      if (startDate) q.set('start_date', startDate);
	      if (endDate) q.set('end_date', endDate);
	      if (search.trim()) q.set('search', search.trim());
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
      if (reset) setEmptyReason(data.empty_reason || null);
    } catch (err: any) {
      setError(err?.message || 'Error fetching recordings');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

	  useEffect(() => {
	    if (user) fetchRecordings(true, { syncFirst: true });
	  }, [orgId, user?.id, startDate, endDate]);

	  useEffect(() => {
	    return () => {
	      Object.values(playbackUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
	    };
	  }, []);

  const handleDownload = async (recording: Recording) => {
    try {
	      const response = await fetch(buildApiUrl(`/api/recordings/${recording.id}/download?inline=1`), {
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

  const handlePlay = async (recording: Recording) => {
    try {
      const response = await fetch(buildApiUrl(`/api/recordings/${recording.id}/download`), {
        headers: { 'x-user-id': user?.id || '', 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        setError('Failed to open recording');
        return;
      }
      const blob = await response.blob();
	      const url = URL.createObjectURL(blob);
	      setPlaybackUrls((previous) => {
	        if (previous[recording.id]) URL.revokeObjectURL(previous[recording.id]);
	        const next = { ...previous, [recording.id]: url };
	        playbackUrlsRef.current = next;
	        return next;
	      });
    } catch (err: any) {
      setError(err?.message || 'Error opening recording');
    }
  };

  const emptyCopy = search.trim()
    ? {
        title: 'No matching recordings',
        description: 'No recording rows match the current number search.',
      }
    : emptyReason === 'no_assigned_numbers'
      ? {
          title: 'No assigned numbers',
          description: 'This account is not assigned to any phone numbers with recording access yet.',
        }
      : emptyReason === 'no_org_membership'
        ? {
            title: 'No organization access',
            description: 'This account is not linked to an organization that can view recordings.',
          }
        : {
            title: 'No synced recordings',
            description: 'Once owned-number recordings are synced, they will appear here.',
          };

  if (!isPlatformAdmin && !orgId && (!orgs || orgs.length === 0)) {
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
      actions={<button onClick={() => fetchRecordings(true, { syncFirst: true })} disabled={loading || syncing} className="vs-button-secondary">{loading || syncing ? 'Refreshing...' : 'Refresh'}</button>}
    >
      <div className="space-y-6">
        <SectionCard title="Recording filters" description="Search recording activity by the numbers involved.">
	          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,260px),180px,180px,1fr] lg:items-end">
	            <div>
	              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Search Number</label>
	              <input value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => fetchRecordings(true)} placeholder="+1212..." className="vs-input w-full" />
	            </div>
	            <div>
	              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Start Date</label>
	              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="vs-input w-full" />
	            </div>
	            <div>
	              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">End Date</label>
	              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="vs-input w-full" />
	            </div>
	            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">{syncing ? 'Syncing recent MightyCall recordings...' : 'Scope: assigned numbers only'}</div>
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
            <div className="p-5"><EmptyStatePanel title={emptyCopy.title} description={emptyCopy.description} /></div>
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
	                            <>
	                              <button onClick={() => handlePlay(recording)} className="vs-button-secondary !px-3 !py-1.5 !text-xs">Play</button>
	                              {playbackUrls[recording.id] && (
	                                <audio src={playbackUrls[recording.id]} controls className="h-9 max-w-[220px]" />
	                              )}
	                            </>
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
