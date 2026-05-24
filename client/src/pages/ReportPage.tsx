import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';

type ReportTab = 'overview' | 'calls' | 'recordings' | 'sms' | 'transfers' | 'numbers' | 'agents';

type PhoneOption = { id: string; org_id: string; number: string; label?: string | null; digits: string };
type Overview = Record<string, any>;
type Row = Record<string, any>;

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

export default function ReportPage() {
  const { user, globalRole, orgs, selectedOrgId, setSelectedOrgId } = useAuth();
  const { org } = useOrg();
  const isPlatformAdmin = globalRole === 'platform_admin';
  const activeOrgId = isPlatformAdmin ? selectedOrgId : (selectedOrgId || org?.id || orgs[0]?.id || null);

  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [startDate, setStartDate] = useState(isoDateDaysAgo(30));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedNumber, setSelectedNumber] = useState('');
  const [agent, setAgent] = useState('');
  const [direction, setDirection] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [numbers, setNumbers] = useState<PhoneOption[]>([]);
  const [overview, setOverview] = useState<Overview>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildQuery = (extra?: Record<string, string>) => {
    const q = new URLSearchParams();
    if (activeOrgId) q.set('org_id', activeOrgId);
    if (startDate) q.set('start_date', startDate);
    if (endDate) q.set('end_date', endDate);
    if (selectedNumber) q.set('number', selectedNumber);
    if (agent.trim()) q.set('agent', agent.trim());
    if (direction !== 'all') q.set('direction', direction);
    if (status !== 'all') q.set('status', status);
    if (search.trim()) q.set('search', search.trim());
    Object.entries(extra || {}).forEach(([key, value]) => q.set(key, value));
    return q.toString();
  };

  const loadNumbers = async () => {
    if (!user?.id) return;
    const response = await fetch(buildApiUrl(`/api/reports/numbers?${buildQuery()}`), {
      headers: { 'x-user-id': user.id },
    });
    if (!response.ok) return;
    const data = await response.json();
    setNumbers(data.numbers || []);
  };

  const loadReport = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'overview') {
        const response = await fetch(buildApiUrl(`/api/reports/overview?${buildQuery()}`), { headers: { 'x-user-id': user.id } });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to load overview');
        const data = await response.json();
        setOverview(data.overview || {});
        setRows([]);
      } else if (activeTab === 'numbers') {
        await loadNumbers();
        setRows([]);
      } else {
        const endpoint = activeTab === 'agents' ? 'agents' : activeTab;
        const response = await fetch(buildApiUrl(`/api/reports/${endpoint}?${buildQuery({ limit: '5000' })}`), { headers: { 'x-user-id': user.id } });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Failed to load ${activeTab}`);
        const data = await response.json();
        setRows(data[activeTab] || data.messages || data.agents || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadNumbers(); }, [user?.id, activeOrgId]);
  useEffect(() => { void loadReport(); }, [user?.id, activeOrgId, activeTab, startDate, endDate, direction, status]);

  const runSync = async () => {
    if (!user?.id) return;
    setSyncing(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (activeOrgId) q.set('org_id', activeOrgId);
      const response = await fetch(buildApiUrl(`/api/mightycall/sync?${q.toString()}`), {
        method: 'POST',
        headers: { 'x-user-id': user.id, 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Sync failed');
      await loadReport();
      await loadNumbers();
    } catch (err: any) {
      setError(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const kpis = useMemo(() => ([
    ['Total Calls', overview.total_calls ?? 0],
    ['Answered', overview.answered_calls ?? 0],
    ['Missed', overview.missed_calls ?? 0],
    ['Abandoned', overview.abandoned_calls ?? 0],
    ['Avg Duration', fmtSeconds(overview.avg_duration_seconds)],
    ['Avg Wait', fmtSeconds(overview.avg_wait_seconds)],
    ['Recordings', overview.total_recordings ?? 0],
    ['SMS', overview.total_sms ?? 0],
    ['Inbound SMS', overview.inbound_sms ?? 0],
    ['Outbound SMS', overview.outbound_sms ?? 0],
    ['Transfers', overview.total_transfers ?? 0],
  ]), [overview]);

  const resetFilters = () => {
    setStartDate(isoDateDaysAgo(30));
    setEndDate(new Date().toISOString().slice(0, 10));
    setSelectedNumber('');
    setAgent('');
    setDirection('all');
    setStatus('all');
    setSearch('');
  };

  const actions = (
    <div className="flex flex-wrap gap-2">
      {activeTab !== 'overview' && activeTab !== 'numbers' && (
        <button onClick={() => downloadCsv(`victorysync-${activeTab}.csv`, rows)} className="vs-button-secondary">Export CSV</button>
      )}
      <button onClick={runSync} disabled={syncing} className="vs-button-primary">{syncing ? 'Syncing...' : 'Sync Now'}</button>
      <button onClick={() => loadReport()} disabled={loading} className="vs-button-secondary">{loading ? 'Refreshing...' : 'Refresh'}</button>
    </div>
  );

  return (
    <PageLayout
      eyebrow="Reporting"
      title="Reports"
      description={`Real MightyCall reporting from local synced data. Last sync: ${fmtDate(overview.latest_sync?.finished_at || overview.latest_sync?.started_at)}`}
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

        <div className="flex gap-2 overflow-x-auto">
          {tabLabels.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? 'vs-button-primary' : 'vs-button-secondary'}>
              {tab.label}
            </button>
          ))}
        </div>

        {error && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        {activeTab === 'overview' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {kpis.map(([label, value]) => <MetricStatCard key={label} label={String(label)} value={value} />)}
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <TopList title="Top Agents" rows={overview.top_agents || []} />
              <TopList title="Top Numbers" rows={overview.top_numbers || []} />
              <TopList title="Transfers By Number" rows={overview.transfers_by_number || []} />
            </div>
          </div>
        ) : activeTab === 'numbers' ? (
          <SectionCard title="Number performance" description="Assigned numbers available in the current report scope." contentClassName="p-0">
            <ReportTable rows={numbers} columns={['number', 'label', 'org_id', 'calls', 'answered', 'missed', 'sms', 'transfers', 'recordings']} loading={loading} />
          </SectionCard>
        ) : (
          <SectionCard title={`${tabLabels.find((tab) => tab.id === activeTab)?.label} report`} description="Rows are normalized from real MightyCall/Supabase records only." contentClassName="p-0">
            <ReportTable rows={rows} loading={loading} tab={activeTab} />
          </SectionCard>
        )}
      </div>
    </PageLayout>
  );
}

function TopList({ title, rows }: { title: string; rows: Array<{ key: string; count: number }> }) {
  return (
    <SectionCard title={title}>
      {rows.length === 0 ? <EmptyStatePanel title="No data" description="No matching rows in this filter window." /> : (
        <div className="space-y-3">
          {rows.map((row: any) => (
            <div key={row.key || `${row.org_id || ''}:${row.extension || row.label}`} className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-100">{row.label || row.agent_name || row.key}</div>
                {(row.email || row.extension) && (
                  <div className="truncate text-xs text-slate-500">
                    {[row.email, row.extension ? `Ext ${row.extension}` : null].filter(Boolean).join(' · ')}
                  </div>
                )}
                {typeof row.answered_calls === 'number' && (
                  <div className="mt-1 text-xs text-slate-500">
                    {row.answered_calls} answered · {row.missed_calls || 0} missed · {row.transfers || 0} transfers
                  </div>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold text-white">
                {row.count}{row.unit ? ` ${row.unit}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ReportTable({ rows, loading, tab, columns }: { rows: Row[]; loading: boolean; tab?: ReportTab; columns?: string[] }) {
  const resolvedColumns = columns || (
    tab === 'agents'
      ? ['agent_name', 'email', 'extension', 'total_calls', 'answered_calls', 'missed_calls', 'avg_duration_seconds', 'transfers']
      : tab === 'transfers'
        ? ['transferred_at', 'agent_extension', 'original_caller', 'original_receiving_number', 'transfer_target', 'transfer_type', 'result']
        : tab === 'sms'
          ? ['sent_at', 'from_number', 'to_number', 'direction', 'status', 'message_text']
          : tab === 'recordings'
            ? ['recording_date', 'from_number', 'to_number', 'direction', 'duration_seconds', 'recording_url']
            : ['started_at', 'agent_extension', 'from_number', 'to_number', 'direction', 'status', 'duration_seconds']
  );

  if (loading) return <div className="px-5 py-10 text-sm text-slate-400">Loading report rows...</div>;
  if (rows.length === 0) return <div className="p-5"><EmptyStatePanel title="No matching data" description="No real records matched the current filters." /></div>;

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 border-b border-white/8 bg-[rgba(2,6,23,0.96)] text-slate-500">
          <tr>{resolvedColumns.map((column) => <th key={column} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">{column.replace(/_/g, ' ')}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-white/6">
          {rows.map((row, index) => (
            <tr key={String(row.id || row.external_id || row.external_call_id || index)} className="hover:bg-white/[0.03]">
              {resolvedColumns.map((column) => (
                <td key={column} className="max-w-[320px] truncate px-4 py-3 text-slate-200">
                  {cellValue(row, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cellValue(row: Row, column: string) {
  const value = row[column];
  if (column.includes('date') || column.endsWith('_at')) return <span className="text-xs text-slate-400">{fmtDate(String(value || ''))}</span>;
  if (column.includes('duration')) return fmtSeconds(value);
  if (column === 'recording_url') {
    return value ? <a className="text-cyan-200 hover:text-cyan-100" href={String(value)} target="_blank" rel="noreferrer">Download / Open</a> : <span className="text-slate-500">Recording unavailable</span>;
  }
  if (column === 'direction' || column === 'status' || column === 'result' || column === 'transfer_type') {
    return <StatusBadge tone={badgeTone(String(value || ''))}>{String(value || 'unknown')}</StatusBadge>;
  }
  if (column === 'message_text') return String(value || '').slice(0, 160) || '-';
  if (column === 'number') return <span className="font-mono">{String(value || numberText(row))}</span>;
  return String(value ?? '-') || '-';
}
