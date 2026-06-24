import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, LoadingSkeleton, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { apiFetch, fetchJson } from '../lib/apiClient';
import {
  averageHandleTimeSeconds,
  countMissedCalls,
  formatPhoneNumber,
  formatSeconds,
  isoDateDaysAgo,
  normalizeCallDirection,
  normalizeCallStatus,
} from '../lib/reportingMetrics';

type CallRow = Record<string, any>;

const PAGE_SIZE = 100;
const FIVE_YEAR_DAYS = 5 * 366;
const DEFAULT_VIEW_DAYS = 7;

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
  const metadata = row.metadata || row.raw_payload || {};
  const raw =
    row.direction ||
    row.current_call_direction ||
    row.call_direction ||
    row.callDirection ||
    row.origin ||
    row.requestOrigin ||
    metadata.direction ||
    metadata.callDirection ||
    metadata.call_direction ||
    metadata.origin ||
    metadata.requestOrigin ||
    metadata.callInfo?.direction ||
    metadata.callInfo?.origin ||
    metadata.communication?.direction ||
    metadata.communication?.origin ||
    '';
  return normalizeCallDirection(raw, row.from_number || metadata.from_number || metadata.from, undefined);
}

function statusOf(row: CallRow) {
  return String(row.status || row.result || row.call_status || row.metadata?.status || 'unknown');
}

function callTimestamp(row: CallRow) {
  return row.started_at || row.created_at || row.timestamp || row.date_time || row.date;
}

function rowInDateRange(row: CallRow, startDate: string, endDate: string) {
  const timestamp = Date.parse(String(callTimestamp(row) || ''));
  if (!Number.isFinite(timestamp)) return false;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T23:59:59.999Z`);
  return timestamp >= start && timestamp <= end;
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
    'transfer_status',
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
  const [searchParams] = useSearchParams();
  const isPlatformAdmin = globalRole === 'platform_admin';
  const activeOrgId = isPlatformAdmin ? selectedOrgId : (selectedOrgId || org?.id || orgs[0]?.id || null);
  const orgName = activeOrgId ? (orgs.find((item) => item.id === activeOrgId)?.name || org?.name || 'Selected organization') : 'all organizations';

  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(isoDateDaysAgo(DEFAULT_VIEW_DAYS));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState(searchParams.get('search') || '');
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
    q.set('start_date', isoDateDaysAgo(FIVE_YEAR_DAYS));
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
      const data = await fetchJson(`/api/reports/calls?${buildQuery(offset)}`, {
        headers: { 'x-user-id': user.id },
      });
      const nextRows: CallRow[] = data.calls || [];
      const nextTotal = Number(data.total || nextRows.length || 0);
      const nextPageOffset = data.next_offset ?? null;
      setRows((previous) => (reset ? nextRows : [...previous, ...nextRows]));
      setTotal(nextTotal);
      setNextOffset(nextPageOffset);
    } catch (err: any) {
      setError(err?.message || 'Failed to load calls');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  const syncCalls = async () => {
    if (!user?.id) return;
    setSyncing(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (activeOrgId) q.set('org_id', activeOrgId);
      await fetchJson(`/api/mightycall/sync?${q.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({ orgId: activeOrgId || null, startDate: isoDateDaysAgo(FIVE_YEAR_DAYS), endDate }),
      });
      await loadCalls(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to sync calls');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void loadCalls(true);
  }, [user?.id, activeOrgId, orgs.length, endDate, direction, status, searchParams]);

  useEffect(() => {
    const nextSearch = searchParams.get('search') || '';
    setSearch(nextSearch);
  }, [searchParams]);

  const visibleRows = useMemo(
    () => rows.filter((row) => rowInDateRange(row, startDate, endDate)),
    [endDate, rows, startDate]
  );

  const summary = useMemo(() => {
    const answered = visibleRows.filter((row) => ['answered', 'completed'].includes(normalizeCallStatus(statusOf(row)))).length;
    const missed = countMissedCalls(visibleRows);
    const inbound = visibleRows.filter((row) => directionOf(row) === 'inbound').length;
    const outbound = visibleRows.filter((row) => directionOf(row) === 'outbound').length;
    const recordings = visibleRows.filter((row) => row.recording_url || row.has_recording).length;
    const avgDuration = averageHandleTimeSeconds(visibleRows);
    return { answered, missed, inbound, outbound, recordings, avgDuration };
  }, [visibleRows]);

  const coldCalling = useMemo(() => {
    const outboundRows = visibleRows.filter((row) => directionOf(row) === 'outbound');
    const connected = outboundRows.filter((row) => ['answered', 'completed'].includes(normalizeCallStatus(statusOf(row))));
    const noAnswer = outboundRows.filter((row) => ['missed', 'failed', 'abandoned'].includes(normalizeCallStatus(statusOf(row))));
    const recordings = outboundRows.filter((row) => row.recording_url || row.has_recording);
    const connectRate = outboundRows.length > 0 ? Math.round((connected.length / outboundRows.length) * 1000) / 10 : 0;
    const avgDuration = averageHandleTimeSeconds(connected);
    const byAgent = new Map<string, { agent: string; attempts: number; connected: number; noAnswer: number; recordings: number; avgDuration: number; durationTotal: number }>();
    for (const row of outboundRows) {
      const agent = String(row.agent_name || row.agent_extension || row.extension || 'Unassigned');
      const current = byAgent.get(agent) || { agent, attempts: 0, connected: 0, noAnswer: 0, recordings: 0, avgDuration: 0, durationTotal: 0 };
      current.attempts += 1;
      const normalizedStatus = normalizeCallStatus(statusOf(row));
      if (['answered', 'completed'].includes(normalizedStatus)) current.connected += 1;
      if (['missed', 'failed', 'abandoned'].includes(normalizedStatus)) current.noAnswer += 1;
      if (row.recording_url || row.has_recording) current.recordings += 1;
      current.durationTotal += Number(row.duration_seconds || row.duration || 0) || 0;
      byAgent.set(agent, current);
    }
    const agents = Array.from(byAgent.values())
      .map((row) => ({ ...row, avgDuration: row.connected > 0 ? Math.round(row.durationTotal / row.connected) : 0 }))
      .sort((a, b) => b.attempts - a.attempts || b.connected - a.connected)
      .slice(0, 8);
    return { attempts: outboundRows.length, connected: connected.length, noAnswer: noAnswer.length, recordings: recordings.length, connectRate, avgDuration, agents };
  }, [visibleRows]);

  const openRecording = async (row: CallRow) => {
    const recordingId = row.recording_id || row.recordingId || row.mightycall_recording_id || (row.recording_url ? row.id : null);
    if (!user?.id || !recordingId) {
      setError('Recording is not available for this call.');
      return;
    }
    const response = await apiFetch(`/api/recordings/${encodeURIComponent(String(recordingId))}/download?inline=1`, {
      headers: { 'x-user-id': user.id },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.detail || payload.error || 'Recording is not available for this call.');
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
          <button className="vs-button-secondary" onClick={() => downloadCsv('victorysync-calls.csv', visibleRows)} disabled={visibleRows.length === 0}>Export CSV</button>
          <button className="vs-button-secondary" onClick={() => syncCalls()} disabled={loading || syncing}>{syncing ? 'Syncing...' : 'Sync Calls'}</button>
          <button className="vs-button-primary" onClick={() => loadCalls(true)} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
      )}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricStatCard label="Loaded calls" value={visibleRows.length} hint={`${rows.length} preloaded from 5 years`} accent="cyan" />
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
              setStartDate(isoDateDaysAgo(DEFAULT_VIEW_DAYS));
              setEndDate(new Date().toISOString().slice(0, 10));
            }}>Reset</button>
            <button className="vs-button-primary h-10" onClick={() => loadCalls(true)}>Apply</button>
          </div>
        </SectionCard>

        {error && <div className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

        <SectionCard title="Call log" description="Normalized call activity from synced MightyCall and stored call data." contentClassName="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 7 }).map((_, index) => <LoadingSkeleton key={index} className="h-12" />)}
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="p-5">
              <EmptyStatePanel title="No calls found" description="No real call records matched this filter window. Try a wider date range, another organization, or sync the MightyCall reports." />
            </div>
          ) : (
            <div className="vs-table-shell max-h-[72vh] overflow-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    {[
                      'Date/time',
                      'Direction',
                      'From',
                      'To',
                      'Assigned number',
                      'Agent/extension',
                      'Status',
                      'Duration',
                      'Transfer status',
                      'Recording',
                      ...(isPlatformAdmin ? ['Organization'] : []),
                    ].map((label) => (
                      <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {visibleRows.map((row, index) => {
                    const direction = directionOf(row);
                    const status = statusOf(row);
                    const hasRecording = row.recording_url || row.has_recording;
                    const rowOrgName = orgs.find((item) => item.id === row.org_id)?.name || row.organization_name || row.org_name || row.org_id || '-';
                    return (
                      <tr key={String(row.id || row.external_call_id || row.external_id || index)} className="transition hover:bg-violet-50/40">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{fmtDate(row.started_at || row.created_at)}</td>
                        <td className="px-4 py-3"><StatusBadge tone={statusTone(direction)}>{direction}</StatusBadge></td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{formatPhoneNumber(row.from_number)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{formatPhoneNumber(row.to_number || row.business_number)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{formatPhoneNumber(row.business_number || row.assigned_number || row.phone_number || row.to_number)}</td>
                        <td className="px-4 py-3 text-slate-700">{row.agent_name || row.agent_extension || row.extension || '-'}</td>
                        <td className="px-4 py-3"><StatusBadge tone={statusTone(status)}>{status}</StatusBadge></td>
                        <td className="px-4 py-3 text-slate-700">{formatSeconds(row.duration_seconds || row.duration)}</td>
                        <td className="px-4 py-3 text-slate-700">{row.transfer_status || row.transfer_type || row.transfer_target || '-'}</td>
                        <td className="px-4 py-3">
                          {hasRecording ? (
                            <button className="vs-button-secondary !px-3 !py-1.5 !text-xs" onClick={() => void openRecording(row)}>Open</button>
                          ) : (
                            <span className="text-xs text-slate-500">Unavailable</span>
                          )}
                        </td>
                        {isPlatformAdmin && <td className="px-4 py-3 text-slate-600">{rowOrgName}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {nextOffset !== null && (
                <div className="flex justify-center border-t border-slate-200 bg-white p-4">
                  <button className="vs-button-secondary" onClick={() => loadCalls(false)} disabled={loadingMore}>
                    {loadingMore ? 'Loading more...' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Cold calling tracker"
          description="Outbound activity from MightyCall, grouped for sales and follow-up coaching."
          contentClassName="p-0"
        >
          <div className="grid grid-cols-1 gap-4 border-b border-slate-200 p-5 md:grid-cols-3 xl:grid-cols-6">
            <MetricStatCard label="Outbound attempts" value={coldCalling.attempts} hint="Calls placed" />
            <MetricStatCard label="Connected" value={coldCalling.connected} hint="Answered or completed" accent="emerald" />
            <MetricStatCard label="No answer / failed" value={coldCalling.noAnswer} hint="Follow-up needed" accent="amber" />
            <MetricStatCard label="Connect rate" value={`${coldCalling.connectRate}%`} hint="Connected / attempts" accent="cyan" />
            <MetricStatCard label="Avg talk time" value={formatSeconds(coldCalling.avgDuration)} hint="Connected calls" />
            <MetricStatCard label="Recordings" value={coldCalling.recordings} hint="Outbound recordings" />
          </div>
          {coldCalling.agents.length === 0 ? (
            <div className="p-5">
              <EmptyStatePanel title="No outbound calls in this view" description="Widen the date range or sync MightyCall to populate cold calling activity." />
            </div>
          ) : (
            <div className="vs-table-shell overflow-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    {['Agent / extension', 'Attempts', 'Connected', 'No answer', 'Connect rate', 'Avg duration', 'Recordings'].map((label) => (
                      <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {coldCalling.agents.map((agent) => {
                    const rate = agent.attempts > 0 ? Math.round((agent.connected / agent.attempts) * 1000) / 10 : 0;
                    return (
                      <tr key={agent.agent} className="transition hover:bg-violet-50/40">
                        <td className="px-4 py-3 font-medium text-slate-800">{agent.agent}</td>
                        <td className="px-4 py-3 text-slate-700">{agent.attempts}</td>
                        <td className="px-4 py-3 text-slate-700">{agent.connected}</td>
                        <td className="px-4 py-3 text-slate-700">{agent.noAnswer}</td>
                        <td className="px-4 py-3"><StatusBadge tone={rate >= 35 ? 'success' : rate >= 15 ? 'info' : 'warning'}>{rate}%</StatusBadge></td>
                        <td className="px-4 py-3 text-slate-700">{formatSeconds(agent.avgDuration)}</td>
                        <td className="px-4 py-3 text-slate-700">{agent.recordings}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PageLayout>
  );
}
