import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, LoadingSkeleton, MetricStatCard, SectionCard, SegmentedControl, StatusBadge } from '../components/DashboardPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { apiFetch, fetchJson } from '../lib/apiClient';
import { answerRate, formatPhoneNumber } from '../lib/reportingMetrics';
import { supabase } from '../lib/supabaseClient';

type ReportTab = 'overview' | 'calls' | 'recordings' | 'sms' | 'transfers' | 'numbers' | 'agents';

type PhoneOption = { id: string; org_id: string; number: string; label?: string | null; digits: string };
type Overview = Record<string, any>;
type Row = Record<string, any>;
const FIVE_YEAR_DAYS = 5 * 366;
const DEFAULT_VIEW_DAYS = 7;

const tabLabels: Array<{ id: ReportTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'calls', label: 'Calls' },
  { id: 'recordings', label: 'Recordings' },
  { id: 'sms', label: 'SMS' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'agents', label: 'Agents' },
];

function isoDateDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function fmtDate(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
}

function rowTimestamp(row: Row) {
  return row.started_at || row.recording_date || row.sent_at || row.message_date || row.transferred_at || row.created_at || row.date;
}

function rowInDateRange(row: Row, startDate: string, endDate: string) {
  const value = rowTimestamp(row);
  if (!value) return true;
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return true;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T23:59:59.999Z`);
  return timestamp >= start && timestamp <= end;
}

function fmtSeconds(value: unknown) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
}

function numberText(row: Row) {
  return [row.from_number, row.to_number, row.phone_number, row.original_caller, row.original_receiving_number]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' -> ') || '-';
}

function badgeTone(value?: string | null): 'neutral' | 'success' | 'warning' | 'info' {
  const text = String(value || '').toLowerCase();
  if (text.includes('answer') || text.includes('complete') || text.includes('sent') || text.includes('received')) return 'success';
  if (text.includes('miss') || text.includes('fail') || text.includes('abandon')) return 'warning';
  if (text.includes('inbound') || text.includes('outbound') || text.includes('transfer')) return 'info';
  return 'neutral';
}

function downloadCsv(filename: string, rows: Row[]) {
  if (rows.length === 0) return;
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row).filter((key) => typeof row[key] !== 'object'))));
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

function orgNameFor(row: Row, orgs: Array<{ id: string; name?: string | null }>) {
  return orgs.find((org) => org.id === row.org_id)?.name || row.organization_name || row.org_name || row.org_id || '-';
}

function reportRowTone(row: Row) {
  const text = String(row.status || row.result || '').toLowerCase();
  const direction = String(row.direction || '').toLowerCase();
  if (text.includes('miss') || text.includes('fail') || text.includes('abandon')) {
    return 'border-l-4 border-amber-400 bg-amber-50/45 hover:bg-amber-50';
  }
  if (text.includes('answer') || text.includes('complete') || text.includes('sent') || text.includes('received')) {
    return 'border-l-4 border-emerald-400 bg-emerald-50/35 hover:bg-emerald-50';
  }
  if (direction.includes('out')) return 'border-l-4 border-sky-400 bg-sky-50/35 hover:bg-sky-50';
  if (direction.includes('in')) return 'border-l-4 border-violet-400 bg-violet-50/35 hover:bg-violet-50';
  return 'border-l-4 border-transparent hover:bg-slate-50';
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

export default function ReportPage() {
  const { user, globalRole, orgs, selectedOrgId, setSelectedOrgId } = useAuth();
  const { org } = useOrg();
  const isPlatformAdmin = globalRole === 'platform_admin';
  const activeOrgId = isPlatformAdmin ? selectedOrgId : (selectedOrgId || org?.id || orgs[0]?.id || null);

  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [startDate, setStartDate] = useState(isoDateDaysAgo(DEFAULT_VIEW_DAYS));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedNumber, setSelectedNumber] = useState('');
  const [agent, setAgent] = useState('');
  const [direction, setDirection] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [numbers, setNumbers] = useState<PhoneOption[]>([]);
  const [overview, setOverview] = useState<Overview>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [topAgentEdits, setTopAgentEdits] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildQuery = useCallback((extra?: Record<string, string>, options?: { preload?: boolean }) => {
    const q = new URLSearchParams();
    if (activeOrgId) q.set('org_id', activeOrgId);
    if (startDate) q.set('start_date', options?.preload ? isoDateDaysAgo(FIVE_YEAR_DAYS) : startDate);
    if (endDate) q.set('end_date', endDate);
    if (selectedNumber) q.set('number', selectedNumber);
    if (agent.trim()) q.set('agent', agent.trim());
    if (direction !== 'all') q.set('direction', direction);
    if (status !== 'all') q.set('status', status);
    if (search.trim()) q.set('search', search.trim());
    Object.entries(extra || {}).forEach(([key, value]) => q.set(key, value));
    return q.toString();
  }, [activeOrgId, agent, direction, endDate, search, selectedNumber, startDate, status]);

  useEffect(() => {
    try {
      setTopAgentEdits(JSON.parse(localStorage.getItem('victorysync.reportTopAgentEdits') || '{}'));
    } catch {
      setTopAgentEdits({});
    }
  }, []);

  const loadNumbers = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await fetchJson(`/api/reports/numbers?${buildQuery()}`, {
        headers: { 'x-user-id': user.id },
      });
      setNumbers(data.numbers || []);
    } catch {
      setNumbers([]);
    }
  }, [buildQuery, user?.id]);

  const loadReport = useCallback(async (options?: { silent?: boolean }) => {
    if (!user?.id) return;
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      if (activeTab === 'overview') {
        const data = await fetchJson(`/api/reports/overview?${buildQuery()}`, { headers: { 'x-user-id': user.id }, timeoutMs: 30000 });
        const nextOverview: Overview = data.overview || {};
        setOverview(nextOverview);
        setRows([]);
      } else if (activeTab === 'numbers') {
        await loadNumbers();
        setRows([]);
      } else {
        const endpoint = activeTab === 'agents' ? 'agents' : activeTab;
        const data = await fetchJson(`/api/reports/${endpoint}?${buildQuery({ limit: '1000' })}`, { headers: { 'x-user-id': user.id }, timeoutMs: 30000 });
        const nextRows: Row[] = data[activeTab] || data.messages || data.agents || [];
        setRows(nextRows);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load reports');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeTab, buildQuery, loadNumbers, user?.id]);

  useEffect(() => { void loadNumbers(); }, [loadNumbers, user?.id, activeOrgId, orgs.length]);
  useEffect(() => { void loadReport(); }, [loadReport, user?.id, activeOrgId, orgs.length, activeTab, startDate, endDate, direction, status]);

  useEffect(() => {
    if (!user?.id) return;
    const timer = window.setTimeout(() => {
      void loadReport({ silent: true });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [agent, search, selectedNumber, loadReport, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let refreshTimer: number | null = null;
    const refreshSoon = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void loadReport({ silent: true });
        void loadNumbers();
      }, 500);
    };
    const orgFilter = activeOrgId ? { filter: `org_id=eq.${activeOrgId}` } : {};
    const channel = supabase
      .channel(`reports-auto-refresh:${activeOrgId || 'all'}:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', ...orgFilter }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mightycall_call_logs', ...orgFilter }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mightycall_recordings', ...orgFilter }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mightycall_sms_messages', ...orgFilter }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_transfers', ...orgFilter }, refreshSoon)
      .subscribe();
    const poll = window.setInterval(refreshSoon, 30_000);
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.clearInterval(poll);
      void channel.unsubscribe();
    };
  }, [activeOrgId, loadNumbers, loadReport, user?.id]);

  const runSync = async () => {
    if (!user?.id) return;
    setSyncing(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (activeOrgId) q.set('org_id', activeOrgId);
      q.set('start_date', isoDateDaysAgo(FIVE_YEAR_DAYS));
      if (endDate) q.set('end_date', endDate);
      await fetchJson(`/api/mightycall/sync?${q.toString()}`, {
        method: 'POST',
        headers: { 'x-user-id': user.id, 'Content-Type': 'application/json' },
        timeoutMs: 120000,
      });
      await loadReport();
      await loadNumbers();
    } catch (err: any) {
      setError(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const kpis = useMemo(() => {
    const totalCalls = Number(overview.total_calls || 0);
    const answeredCalls = Number(overview.answered_calls || 0);
    return [
      { label: 'Calls', value: totalCalls, hint: 'Total calls in the selected report window.', accent: 'cyan' as const },
      { label: 'Answered', value: answeredCalls, hint: 'Calls normalized as answered or completed.', accent: 'emerald' as const },
      { label: 'Missed', value: Number(overview.missed_calls || 0), hint: 'Calls that were not successfully connected.', accent: 'amber' as const },
      { label: 'Transfers', value: Number(overview.total_transfers || 0), hint: 'Transfer rows from transfer data or call metadata.', accent: 'violet' as const },
      { label: 'Average duration', value: fmtSeconds(overview.avg_duration_seconds), hint: 'Average call duration from call rows.', accent: 'neutral' as const },
      { label: 'Answer rate', value: `${answerRate(answeredCalls, totalCalls)}%`, hint: 'Answered calls divided by total calls.', accent: 'emerald' as const },
      { label: 'SMS', value: Number(overview.total_sms || 0), hint: `${Number(overview.inbound_sms || 0)} inbound, ${Number(overview.outbound_sms || 0)} outbound.`, accent: 'cyan' as const },
      { label: 'Recordings', value: Number(overview.total_recordings || 0), hint: 'Recording rows available for the selected filters.', accent: 'violet' as const },
    ];
  }, [overview]);

  const resetFilters = () => {
    setStartDate(isoDateDaysAgo(DEFAULT_VIEW_DAYS));
    setEndDate(new Date().toISOString().slice(0, 10));
    setSelectedNumber('');
    setAgent('');
    setDirection('all');
    setStatus('all');
    setSearch('');
  };

  const editedTopAgents = useMemo(() => {
    return (overview.top_agents || []).map((row: any) => {
      const edit = topAgentEdits[row.key] || {};
      return {
        ...row,
        ...edit,
        label: edit.label || row.label || row.agent_name || row.key,
        count: edit.count !== undefined && edit.count !== '' ? Number(edit.count) : row.count,
      };
    }).filter((row: any) => !row.hidden).sort((a: any, b: any) => Number(a.rank || 999) - Number(b.rank || 999) || Number(b.count || 0) - Number(a.count || 0));
  }, [overview.top_agents, topAgentEdits]);

  const editTopAgent = (row: any) => {
    const label = window.prompt('Top agent display name', row.label || row.agent_name || row.key);
    if (label === null) return;
    const count = window.prompt('Displayed result count', String(row.count ?? 0));
    if (count === null) return;
    const rank = window.prompt('Pinned rank (1 is first, blank for automatic)', String(row.rank || ''));
    if (rank === null) return;
    const next = {
      ...topAgentEdits,
      [row.key]: {
        label: label.trim() || row.label || row.agent_name || row.key,
        count: Number.isFinite(Number(count)) ? Number(count) : row.count,
        rank: rank.trim() ? Number(rank) : undefined,
      },
    };
    setTopAgentEdits(next);
    localStorage.setItem('victorysync.reportTopAgentEdits', JSON.stringify(next));
  };

  const openRecording = async (row: Row) => {
    const recordingId = row.recording_id || row.recordingId || row.mightycall_recording_id;
    if (!user?.id || !recordingId) return;
    const response = await apiFetch(`/api/recordings/${encodeURIComponent(String(recordingId))}/download?inline=1`, {
      headers: { 'x-user-id': user.id },
    });
    if (!response.ok) throw new Error('Recording link failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const visibleRows = useMemo(
    () => rows.filter((row) => rowInDateRange(row, startDate, endDate)),
    [endDate, rows, startDate]
  );

  const actions = (
    <div className="flex flex-wrap gap-2">
      {activeTab !== 'overview' && activeTab !== 'numbers' && (
        <button onClick={() => downloadCsv(`victorysync-${activeTab}.csv`, visibleRows)} className="vs-button-secondary">Export CSV</button>
      )}
      <button onClick={runSync} disabled={syncing} className="vs-button-primary">{syncing ? 'Syncing...' : 'Sync Now'}</button>
      <button onClick={() => loadReport()} disabled={loading} className="vs-button-secondary">{loading ? 'Refreshing...' : 'Refresh'}</button>
    </div>
  );

  return (
    <PageLayout
      eyebrow="Reporting"
      title="Reports"
      description={`Real reporting from synced source data. Last sync: ${fmtDate(overview.latest_sync?.finished_at || overview.latest_sync?.started_at)}`}
      actions={actions}
    >
      <div className="space-y-5">
        <SectionCard title="Filters" contentClassName="p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-9">
            {isPlatformAdmin && (
              <select value={activeOrgId || ''} onChange={(e) => setSelectedOrgId(e.target.value || null)} className="vs-input h-10 text-sm">
                <option value="">All organizations</option>
                {orgs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="vs-input h-10 text-sm" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="vs-input h-10 text-sm" />
            <select value={selectedNumber} onChange={(e) => setSelectedNumber(e.target.value)} className="vs-input h-10 text-sm">
              <option value="">All numbers</option>
              {numbers.map((number) => <option key={number.id} value={number.number}>{number.label ? `${number.label} - ${number.number}` : number.number}</option>)}
            </select>
            <input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="Extension" className="vs-input h-10 text-sm" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => loadReport()} placeholder="Search number" className="vs-input h-10 text-sm" />
            <select value={direction} onChange={(e) => setDirection(e.target.value)} className="vs-input h-10 text-sm">
              <option value="all">All directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="vs-input h-10 text-sm">
              <option value="all">All statuses</option>
              <option value="answered">Answered</option>
              <option value="missed">Missed</option>
              <option value="abandoned">Abandoned</option>
              <option value="voicemail">Voicemail</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <button onClick={resetFilters} className="vs-button-secondary h-10">Reset</button>
            <button onClick={() => loadReport()} className="vs-button-primary h-10">Apply</button>
          </div>
        </SectionCard>

        <SegmentedControl options={tabLabels.map((tab) => ({ value: tab.id, label: tab.label }))} value={activeTab} onChange={setActiveTab} />

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        {activeTab === 'overview' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {loading
                ? Array.from({ length: 8 }).map((_, index) => <LoadingSkeleton key={index} className="h-32" />)
                : kpis.map((kpi) => <MetricStatCard key={kpi.label} label={kpi.label} value={kpi.value} hint={kpi.hint} accent={kpi.accent} />)}
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <TopList title="Top Agents" rows={editedTopAgents} onEdit={editTopAgent} />
              <TopList title="Top Numbers" rows={overview.top_numbers || []} />
              <TopList title="Transfers By Number" rows={overview.transfers_by_number || []} />
            </div>
          </div>
        ) : activeTab === 'numbers' ? (
          <SectionCard title="Number performance" description="Assigned numbers available in the current report scope." contentClassName="p-0">
            <ReportTable rows={numbers} columns={['number', 'label', 'org_id', 'calls', 'answered', 'missed', 'sms', 'transfers', 'recordings']} loading={loading} orgs={orgs} isPlatformAdmin={isPlatformAdmin} />
          </SectionCard>
        ) : (
          <SectionCard title={`${tabLabels.find((tab) => tab.id === activeTab)?.label} report`} description="Rows are normalized from real source records only." contentClassName="p-0">
            <ReportTable rows={visibleRows} loading={loading} tab={activeTab} onOpenRecording={openRecording} orgs={orgs} isPlatformAdmin={isPlatformAdmin} />
          </SectionCard>
        )}
      </div>
    </PageLayout>
  );
}

function TopList({ title, rows, onEdit }: { title: string; rows: Array<{ key: string; count: number }>; onEdit?: (row: any) => void }) {
  return (
    <SectionCard title={title}>
      {rows.length === 0 ? <EmptyStatePanel title="No data" description="No matching rows in this filter window." /> : (
        <div className="space-y-3">
          {rows.map((row: any) => (
            <div key={row.key || `${row.org_id || ''}:${row.extension || row.label}`} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-950">{row.label || row.agent_name || row.key}</div>
                {(row.email || row.extension) && (
                  <div className="truncate text-xs text-slate-500">
                    {[row.email, row.extension ? `Ext ${row.extension}` : null].filter(Boolean).join(' · ')}
                  </div>
                )}
                {typeof row.answered_calls === 'number' && (
                  <div className="mt-1 text-xs text-slate-500">
                    {row.total_calls || 0} calls · {row.total_recordings || 0} recordings · {row.total_sms || 0} SMS · {row.transfers || 0} transfers
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-semibold text-slate-950">{row.count}{row.unit ? ` ${row.unit}` : ''}</span>
                {onEdit && <button type="button" onClick={() => onEdit(row)} className="vs-button-secondary px-2 py-1 text-xs">Edit</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ReportTable({
  rows,
  loading,
  tab,
  columns,
  onOpenRecording,
  orgs,
  isPlatformAdmin,
}: {
  rows: Row[];
  loading: boolean;
  tab?: ReportTab;
  columns?: string[];
  onOpenRecording?: (row: Row) => Promise<void>;
  orgs: Array<{ id: string; name?: string | null }>;
  isPlatformAdmin: boolean;
}) {
  const resolvedColumns = columns || (
    tab === 'agents'
      ? ['agent_name', 'email', 'extension', 'total_activity', 'total_calls', 'total_recordings', 'total_sms', 'answered_calls', 'missed_calls', 'avg_duration_seconds', 'transfers']
      : tab === 'transfers'
        ? ['transferred_at', 'agent_extension', 'original_caller', 'original_receiving_number', 'transfer_target', 'transfer_type', 'result']
        : tab === 'sms'
          ? ['sent_at', 'direction', 'from_number', 'to_number', 'phone_number', 'status', 'message_text']
          : tab === 'recordings'
            ? ['recording_date', 'from_number', 'to_number', 'agent_extension', 'duration_seconds', 'status', 'recording_url']
            : ['started_at', 'direction', 'from_number', 'to_number', 'business_number', 'agent_extension', 'status', 'duration_seconds', 'transfer_status', 'recording_url']
  );
  const displayColumns = isPlatformAdmin && !resolvedColumns.includes('organization') ? [...resolvedColumns, 'organization'] : resolvedColumns;

  if (loading) return <div className="space-y-3 p-5">{Array.from({ length: 7 }).map((_, index) => <LoadingSkeleton key={index} className="h-12" />)}</div>;
  if (rows.length === 0) return <div className="p-5"><EmptyStatePanel title="No matching data" description="No real records matched the current filters." /></div>;

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-500">
          <tr>{displayColumns.map((column) => <th key={column} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]">{column.replace(/_/g, ' ')}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, index) => (
            <tr key={String(row.id || row.external_id || row.external_call_id || index)} className={reportRowTone(row)}>
              {displayColumns.map((column) => (
                <td key={column} className="max-w-[320px] truncate px-4 py-3 text-slate-700">
                  {cellValue(row, column, onOpenRecording, orgs)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cellValue(row: Row, column: string, onOpenRecording?: (row: Row) => Promise<void>, orgs: Array<{ id: string; name?: string | null }> = []) {
  const value = row[column];
  if (column === 'organization') return orgNameFor(row, orgs);
  if (column.includes('date') || column.endsWith('_at')) return <span className="text-xs text-slate-500">{fmtDate(String(value || ''))}</span>;
  if (column.includes('duration')) return fmtSeconds(value);
  if (column === 'recording_url') {
    return hasPlayableRecordingUrl(row.recording_url) && (row.recording_id || row.recordingId || row.mightycall_recording_id) ? <button type="button" className="vs-button-secondary !px-3 !py-1.5 !text-xs" onClick={() => onOpenRecording?.(row).catch(() => undefined)}>Open</button> : <span className="text-slate-500">Unavailable</span>;
  }
  if (column === 'direction' || column === 'status' || column === 'result' || column === 'transfer_type') {
    return <StatusBadge tone={badgeTone(String(value || ''))}>{String(value || 'unknown')}</StatusBadge>;
  }
  if (['from_number', 'to_number', 'phone_number', 'business_number', 'original_caller', 'original_receiving_number'].includes(column)) return <span className="font-mono text-xs">{formatPhoneNumber(value)}</span>;
  if (column === 'message_text') return String(value || '').slice(0, 160) || '-';
  if (column === 'number') return <span className="font-mono">{String(value || numberText(row))}</span>;
  return String(value ?? '-') || '-';
}
