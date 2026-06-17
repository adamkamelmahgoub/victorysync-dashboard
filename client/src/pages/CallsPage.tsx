import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';
import {
  averageHandleTimeSeconds,
  countMissedCalls,
  formatPhoneNumber,
  formatSeconds,
  isoDateDaysAgo,
  normalizeCallStatus,
} from '../lib/reportingMetrics';

type CallRow = Record<string, any>;

const PAGE_SIZE = 100;

function fmtDate(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
}

function statusTone(value?: string | null): 'neutral' | 'success' | 'warning' | 'info' {
  const normalized = normalizeCallStatus(value);
  const text = String(value || '').toLowerCase();
  if (['answered', 'completed'].includes(normalized)) return 'success';
  if (['missed', 'failed', 'abandoned'].includes(normalized)) return 'warning';
  if (text.includes('inbound') || text.includes('outbound') || text.includes('transfer')) return 'info';
  return 'neutral';
}

function directionOf(row: CallRow) {
  const raw = String(row.direction || row.current_call_direction || row.metadata?.direction || '').toLowerCase();
  if (raw.includes('out')) return 'outbound';
  if (raw.includes('in')) return 'inbound';
  return raw || 'unknown';
}

function statusOf(row: CallRow) {
  return String(row.status || row.result || row.call_status || row.metadata?.status || 'unknown');
}

function downloadCsv(filename: string, rows: CallRow[]) {
  if (rows.length === 0) return;
  const keys = [
    'started_at',
    'direction',
    'status',
    'from_number',
    'to_number',
    'business_number',
    'agent_extension',
    'duration_seconds',
    'wait_seconds',
    'external_call_id',
    'recording_url',
  ];
  const csv = [
    keys.join(','),
    ...rows.map((row) => keys.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function CallsPage() {
  const { user, globalRole, orgs, selectedOrgId, setSelectedOrgId } = useAuth();
  const { org } = useOrg();
  const isPlatformAdmin = globalRole === 'platform_admin';
  const activeOrgId = isPlatformAdmin ? selectedOrgId : (selectedOrgId || org?.id || orgs[0]?.id || null);
  const orgName = activeOrgId ? (orgs.find((item) => item.id === activeOrgId)?.name || org?.name || 'Selected organization') : 'all organizations';

  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(isoDateDaysAgo(14));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all');
  const [status, setStatus] = useState('all');
  const [agent, setAgent] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [total, setTotal] = useState(0);

  const buildQuery = (offset = 0) => {
    const q = new URLSearchParams();
    q.set('limit', String(PAGE_SIZE));
    q.set('offset', String(offset));
    if (activeOrgId) q.set('org_id', activeOrgId);
    if (startDate) q.set('start_date', startDate);
    if (endDate) q.set('end_date', endDate);
    if (search.trim()) q.set('search', search.trim());
    if (agent.trim()) q.set('agent', agent.trim());
    if (direction !== 'all') q.set('direction', direction);
    if (status !== 'all') q.set('status', status);
    return q.toString();
  };

  const loadCalls = async (reset = true) => {
    if (!user?.id) return;
    if (!reset && nextOffset == null) return;
    const offset = reset ? 0 : (nextOffset ?? 0);
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const response = await fetch(buildApiUrl(`/api/reports/calls?${buildQuery(offset)}`), {
        headers: { 'x-user-id': user.id },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || data?.error || 'Failed to load calls');
      const nextRows = data.calls || [];
      setRows((previous) => (reset ? nextRows : [...previous, ...nextRows]));
      setTotal(Number(data.total || nextRows.length || 0));
      setNextOffset(data.next_offset ?? null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load calls');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadCalls(true);
  }, [user?.id, activeOrgId, startDate, endDate, direction, status]);

  const summary = useMemo(() => {
    const answered = rows.filter((row) => ['answered', 'completed'].includes(normalizeCallStatus(statusOf(row)))).length;
    const missed = countMissedCalls(rows);
    const inbound = rows.filter((row) => directionOf(row) === 'inbound').length;
    const outbound = rows.filter((row) => directionOf(row) === 'outbound').length;
    const recordings = rows.filter((row) => row.recording_url || row.has_recording).length;
    const avgDuration = averageHandleTimeSeconds(rows);
    return { answered, missed, inbound, outbound, recordings, avgDuration };
  }, [rows]);

  const openRecording = async (row: CallRow) => {
    if (!user?.id || !row.id) {
      if (row.recording_url) window.open(String(row.recording_url), '_blank', 'noopener,noreferrer');
      return;
    }
    const response = await fetch(buildApiUrl(`/api/recordings/${encodeURIComponent(String(row.id))}/download?inline=1`), {
      headers: { 'x-user-id': user.id },
    });
    if (!response.ok) {
      if (row.recording_url) window.open(String(row.recording_url), '_blank', 'noopener,noreferrer');
      else setError('Recording is not available for this call.');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <PageLayout
      eyebrow="Call operations"
      title="Calls"
      description={`Searchable call log for ${orgName}, including outcomes, recordings, transfers, and source IDs.`}
      actions={(
        <div className="flex flex-wrap gap-2">
          <button className="vs-button-secondary" onClick={() => downloadCsv('victorysync-calls.csv', rows)} disabled={rows.length === 0}>Export CSV</button>
          <button className="vs-button-primary" onClick={() => loadCalls(true)} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
      )}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricStatCard label="Loaded calls" value={rows.length} hint={`${total} total in scope`} accent="cyan" />
          <MetricStatCard label="Answered" value={summary.answered} hint="Connected or completed" accent="emerald" />
          <MetricStatCard label="Missed / failed" value={summary.missed} hint="Needs follow-up review" accent="amber" />
          <MetricStatCard label="Inbound" value={summary.inbound} hint="Customer-originated" />
          <MetricStatCard label="Outbound" value={summary.outbound} hint="Team-originated" />
          <MetricStatCard label="Avg duration" value={formatSeconds(summary.avgDuration)} hint={`${summary.recordings} recordings`} />
        </div>

        <SectionCard title="Filters" description="Narrow the call log without changing source data.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-8">
            {isPlatformAdmin && (
              <select value={activeOrgId || ''} onChange={(e) => setSelectedOrgId(e.target.value || null)} className="vs-input h-10 text-sm xl:col-span-2" aria-label="Organization">
                <option value="">All organizations</option>
                {orgs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="vs-input h-10 text-sm" aria-label="Start date" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="vs-input h-10 text-sm" aria-label="End date" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void loadCalls(true); }} placeholder="Phone or call ID" className="vs-input h-10 text-sm xl:col-span-2" />
            <input value={agent} onChange={(e) => setAgent(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void loadCalls(true); }} placeholder="Agent / extension" className="vs-input h-10 text-sm" />
            <select value={direction} onChange={(e) => setDirection(e.target.value)} className="vs-input h-10 text-sm" aria-label="Direction">
              <option value="all">All directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="vs-input h-10 text-sm" aria-label="Status">
              <option value="all">All statuses</option>
              <option value="answered">Answered</option>
              <option value="missed">Missed</option>
              <option value="abandoned">Abandoned</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <button className="vs-button-secondary h-10" onClick={() => {
              setSearch('');
              setAgent('');
              setDirection('all');
              setStatus('all');
              setStartDate(isoDateDaysAgo(14));
              setEndDate(new Date().toISOString().slice(0, 10));
            }}>Reset</button>
            <button className="vs-button-primary h-10" onClick={() => loadCalls(true)}>Apply</button>
          </div>
        </SectionCard>

        {error && <div className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

        <SectionCard title="Call log" description="Normalized call activity from synced MightyCall and stored call data." contentClassName="p-0">
          {loading ? (
            <div className="px-5 py-10 text-sm text-slate-400">Loading calls...</div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyStatePanel title="No calls found" description="No real call records matched this filter window. Try a wider date range, another organization, or sync the MightyCall reports." />
            </div>
          ) : (
            <div className="max-h-[72vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0c1120]/95 text-slate-400">
                  <tr>
                    {['Time', 'Direction', 'Status', 'From', 'To', 'Agent', 'Duration', 'MightyCall ID', 'Recording'].map((label) => (
                      <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {rows.map((row, index) => {
                    const direction = directionOf(row);
                    const status = statusOf(row);
                    const hasRecording = row.recording_url || row.has_recording;
                    return (
                      <tr key={String(row.id || row.external_call_id || row.external_id || index)} className="transition hover:bg-white/[0.035]">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{fmtDate(row.started_at || row.created_at)}</td>
                        <td className="px-4 py-3"><StatusBadge tone={statusTone(direction)}>{direction}</StatusBadge></td>
                        <td className="px-4 py-3"><StatusBadge tone={statusTone(status)}>{status}</StatusBadge></td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-200">{formatPhoneNumber(row.from_number)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-200">{formatPhoneNumber(row.to_number || row.business_number)}</td>
                        <td className="px-4 py-3 text-slate-300">{row.agent_name || row.agent_extension || row.extension || '-'}</td>
                        <td className="px-4 py-3 text-slate-300">{formatSeconds(row.duration_seconds || row.duration)}</td>
                        <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs text-slate-500">{row.external_call_id || row.external_id || row.mightycall_call_id || '-'}</td>
                        <td className="px-4 py-3">
                          {hasRecording ? (
                            <button className="vs-button-secondary !px-3 !py-1.5 !text-xs" onClick={() => void openRecording(row)}>Open</button>
                          ) : (
                            <span className="text-xs text-slate-500">Unavailable</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {nextOffset !== null && (
                <div className="flex justify-center border-t border-white/[0.08] p-4">
                  <button className="vs-button-secondary" onClick={() => loadCalls(false)} disabled={loadingMore}>
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
