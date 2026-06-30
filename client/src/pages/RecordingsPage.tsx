import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { apiFetch, fetchJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { buildApiUrl } from '../config';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, ErrorStatePanel, LoadingSkeleton, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { errorFromCatch, toUiError, type UiError } from '../lib/errors';

type Recording = {
  id: string;
  org_id: string;
  from_number?: string | null;
  to_number?: string | null;
  duration_seconds?: number | null;
  duration?: number | null;
  recording_date?: string | null;
  recording_url?: string | null;
  direction?: string | null;
  created_at?: string | null;
  status?: string | null;
  agent_name?: string | null;
  agent_extension?: string | null;
  extension?: string | null;
  organization_name?: string | null;
};

const DEFAULT_VIEW_DAYS = 7;

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

function hasPlayableRecordingUrl(value?: string | null) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function recordingRowTone(recording: Recording) {
  const status = String(recording.status || '').toLowerCase();
  if (status.includes('fail') || status.includes('error')) {
    return 'border-l-4 border-amber-400 bg-amber-50/45 hover:bg-amber-50';
  }
  if (!hasPlayableRecordingUrl(recording.recording_url)) {
    return 'border-l-4 border-slate-300 bg-slate-50/70 hover:bg-slate-100/70';
  }
  if (recording.direction === 'outbound') return 'border-l-4 border-sky-400 bg-sky-50/35 hover:bg-sky-50';
  if (recording.direction === 'inbound') return 'border-l-4 border-emerald-400 bg-emerald-50/35 hover:bg-emerald-50';
  return 'border-l-4 border-violet-300 bg-violet-50/25 hover:bg-violet-50/60';
}

function recordingTimestamp(recording: Recording) {
  return recording.recording_date || recording.created_at;
}

function rowInDateRange(recording: Recording, startDate: string, endDate: string) {
  const timestamp = Date.parse(String(recordingTimestamp(recording) || ''));
  if (!Number.isFinite(timestamp)) return false;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T23:59:59.999Z`);
  return timestamp >= start && timestamp <= end;
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
  const [error, setError] = useState<UiError | null>(null);
  const [search, setSearch] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [syncing, setSyncing] = useState(false);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(isoDateDaysAgo(DEFAULT_VIEW_DAYS));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [directionFilter, setDirectionFilter] = useState('all');
  const [playbackUrls, setPlaybackUrls] = useState<Record<string, string>>({});
  const playbackUrlsRef = useRef<Record<string, string>>({});

  const filteredRows = useMemo(() => {
    const q = search.trim();
    const byDate = recordings.filter((recording) => rowInDateRange(recording, startDate, endDate));
    if (!q) return byDate;
    return byDate.filter((r) => String(r.from_number || '').includes(q) || String(r.to_number || '').includes(q));
  }, [endDate, recordings, search, startDate]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const totalSeconds = filteredRows.reduce((a, r) => a + secondsOf(r), 0);
    const avgSeconds = total > 0 ? Math.round(totalSeconds / total) : 0;
    return { total, totalSeconds, avgSeconds };
  }, [filteredRows]);

  const syncRecentRecordings = async () => {
    if (!user?.id) return;
    setSyncing(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (orgId) q.set('org_id', orgId);
      await fetchJson(`/api/mightycall/sync/recordings?${q.toString()}`, {
        method: 'POST',
        headers: { 'x-user-id': user.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: orgId || null }),
        timeoutMs: 120000,
      });
      await fetchRecordings(true);
    } catch (e: any) {
      setError(errorFromCatch(e, 'Failed to sync recent recordings'));
    } finally {
      setSyncing(false);
    }
  };

  const fetchRecordings = useCallback(async (reset = true, options?: { silent?: boolean }) => {
    if (!user) return;
    if (!reset && nextOffset == null) return;

    const activeOffset = reset ? 0 : (nextOffset ?? 0);
    const silent = options?.silent === true;

    try {
      if (reset) {
        if (!silent) {
          setLoading(true);
          setError(null);
        }
      } else {
        setLoadingMore(true);
      }

      const q = new URLSearchParams();
	      q.set('limit', '500');
	      q.set('offset', String(activeOffset));
	      if (orgId) q.set('org_id', orgId);
		      if (startDate) q.set('start_date', startDate);
		      if (endDate) q.set('end_date', endDate);
		      if (search.trim()) q.set('search', search.trim());
		      if (directionFilter !== 'all') q.set('direction', directionFilter);
      const data = await fetchJson(`/api/reports/recordings?${q.toString()}`, {
        headers: { 'x-user-id': user.id, 'Content-Type': 'application/json' },
      });
      const rows: Recording[] = data.recordings || [];
      const nextPageOffset = data.next_offset ?? null;
      const reason = data.empty_reason || null;
      setRecordings((prev) => (reset ? rows : [...prev, ...rows]));
      setNextOffset(nextPageOffset);
      if (reset) setEmptyReason(reason);
    } catch (err: any) {
      setError(errorFromCatch(err, 'Error fetching recordings'));
    } finally {
      if (reset) {
        if (!silent) setLoading(false);
      }
      else setLoadingMore(false);
    }
  }, [directionFilter, endDate, nextOffset, orgId, search, startDate, user]);

		  useEffect(() => {
		    if (user) fetchRecordings(true);
		  }, [fetchRecordings, orgId, user?.id, orgs.length, endDate, directionFilter]);

	  useEffect(() => {
	    if (!user?.id) return;
	    const timer = window.setTimeout(() => {
	      void fetchRecordings(true, { silent: true });
	    }, 450);
	    return () => window.clearTimeout(timer);
	  }, [fetchRecordings, search, user?.id]);

	  useEffect(() => {
	    if (!user?.id) return;
	    let refreshTimer: number | null = null;
	    const refreshSoon = () => {
	      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
	      refreshTimer = window.setTimeout(() => void fetchRecordings(true, { silent: true }), 500);
	    };
	    const orgFilter = orgId ? { filter: `org_id=eq.${orgId}` } : {};
	    const channel = supabase
	      .channel(`recordings-auto-refresh:${orgId || 'all'}:${user.id}`)
	      .on('postgres_changes', { event: '*', schema: 'public', table: 'mightycall_recordings', ...orgFilter }, refreshSoon)
	      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', ...orgFilter }, refreshSoon)
	      .subscribe();
	    const poll = window.setInterval(() => void fetchRecordings(true, { silent: true }), 30_000);
	    return () => {
	      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
	      window.clearInterval(poll);
	      void channel.unsubscribe();
	    };
	  }, [fetchRecordings, orgId, user?.id]);

	  useEffect(() => {
	    return () => {
	      Object.values(playbackUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
	    };
	  }, []);

  const handleDownload = async (recording: Recording) => {
    if (!recording.id) {
      setError({ code: 'REC_MISSING_ID', message: 'Recording is not available for download.' });
      return;
    }
    try {
	      const response = await apiFetch(`/api/recordings/${encodeURIComponent(recording.id)}/download?inline=1`, {
        headers: { 'x-user-id': user?.id || '', 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const uiError = toUiError({ ...payload, status: response.status }, 'Failed to download recording');
        setError(uiError);
        if (uiError.fallbackPath) window.open(buildApiUrl(uiError.fallbackPath), '_blank', 'noopener,noreferrer');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const extension = blob.type.includes('wav') ? 'wav' : blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') || blob.type.includes('m4a') ? 'm4a' : 'mp3';
      a.download = `recording-${recording.id}.${extension}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: any) {
      setError(errorFromCatch(err, 'Error downloading recording'));
    }
  };

  const handlePlay = async (recording: Recording) => {
    try {
      const response = await apiFetch(`/api/recordings/${encodeURIComponent(recording.id)}/download`, {
        headers: { 'x-user-id': user?.id || '', 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const uiError = toUiError({ ...payload, status: response.status }, 'Failed to open recording');
        setError(uiError);
        if (uiError.fallbackPath) window.open(buildApiUrl(uiError.fallbackPath), '_blank', 'noopener,noreferrer');
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
      setError(errorFromCatch(err, 'Error opening recording'));
    }
  };

  const openFallbackRecording = () => {
    if (error?.fallbackPath) window.open(buildApiUrl(error.fallbackPath), '_blank', 'noopener,noreferrer');
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
	      actions={(
	        <div className="flex flex-wrap gap-2">
	          <button onClick={syncRecentRecordings} disabled={syncing || loading} className="vs-button-primary">
	            {syncing ? 'Syncing...' : 'Sync Recordings'}
	          </button>
	          <button onClick={() => fetchRecordings(true)} disabled={loading} className="vs-button-secondary">{loading ? 'Refreshing...' : 'Refresh'}</button>
	        </div>
	      )}
    >
      <div className="space-y-6">
        <SectionCard title="Recording filters" description="Search recording activity by the numbers involved.">
		          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,260px),180px,180px,180px,1fr] lg:items-end">
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
		            <div>
		              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Direction</label>
		              <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)} className="vs-input w-full">
		                <option value="all">All</option>
		                <option value="inbound">Inbound</option>
		                <option value="outbound">Outbound</option>
		              </select>
		            </div>
	            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">{syncing ? 'Syncing recent recordings...' : 'Scope: assigned numbers only'}</div>
          </div>
        </SectionCard>

        {error && (
          <ErrorStatePanel
            error={error}
            title="Recording action failed"
            onRetry={() => fetchRecordings(true)}
            onFallback={error.fallbackPath ? openFallbackRecording : undefined}
          />
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricStatCard label="Recordings" value={summary.total} />
          <MetricStatCard label="Total Duration" value={fmtDuration(summary.totalSeconds)} />
          <MetricStatCard label="Average Duration" value={fmtDuration(summary.avgSeconds)} accent="cyan" />
        </div>

        <SectionCard title="Recording list" description="Review call recordings with direct playback and download actions." contentClassName="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 7 }).map((_, index) => <LoadingSkeleton key={index} className="h-12" />)}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-5"><EmptyStatePanel title={emptyCopy.title} description={emptyCopy.description} /></div>
          ) : (
            <div className="vs-table-shell max-h-[72vh] overflow-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Call date/time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">From</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">To</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Direction</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Agent / extension</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Status</th>
                    {isPlatformAdmin && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Organization</th>}
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Recording</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRows.map((recording) => (
                    <tr key={recording.id} className={`transition ${recordingRowTone(recording)}`}>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(recording.recording_date || recording.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{recording.from_number || '-'}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{recording.to_number || '-'}</td>
                      <td className="px-4 py-3"><StatusBadge tone={recording.direction === 'outbound' ? 'info' : recording.direction === 'inbound' ? 'success' : 'neutral'}>{recording.direction || 'unknown'}</StatusBadge></td>
                      <td className="px-4 py-3 text-slate-700">{recording.agent_name || recording.agent_extension || recording.extension || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{fmtDuration(secondsOf(recording))}</td>
                      <td className="px-4 py-3"><StatusBadge tone={String(recording.status || '').toLowerCase().includes('fail') ? 'warning' : 'neutral'}>{recording.status || 'available'}</StatusBadge></td>
                      {isPlatformAdmin && <td className="px-4 py-3 text-slate-700">{recording.organization_name || orgs.find((org) => org.id === recording.org_id)?.name || recording.org_id || '-'}</td>}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
	                          {recording.id && hasPlayableRecordingUrl(recording.recording_url) ? (
	                            <>
	                              <button onClick={() => handlePlay(recording)} className="vs-button-secondary !px-3 !py-1.5 !text-xs">Play</button>
	                              {playbackUrls[recording.id] && (
	                                <audio src={playbackUrls[recording.id]} controls className="h-9 max-w-[220px]" />
	                              )}
	                            </>
	                          ) : <span className="text-xs text-slate-500">N/A</span>}
                          {recording.id && hasPlayableRecordingUrl(recording.recording_url) && <button onClick={() => handleDownload(recording)} className="vs-button-secondary !px-3 !py-1.5 !text-xs">Download</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {nextOffset !== null && (
                <div className="flex justify-center border-t border-slate-200 bg-white p-4">
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
