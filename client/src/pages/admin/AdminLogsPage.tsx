import React, { useEffect, useMemo, useState } from 'react';
import PageLayout from '../../components/PageLayout';
import { getAdminLogs, getAdminLogsSummary, updateErrorLogResolved } from '../../lib/apiClient';
import { useAuth } from '../../contexts/AuthContext';

type Tab = 'activity' | 'pageviews' | 'errors' | 'api' | 'auth' | 'sessions';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'activity', label: 'Activity Feed' },
  { id: 'pageviews', label: 'Page Views' },
  { id: 'errors', label: 'Error Logs' },
  { id: 'api', label: 'API Logs' },
  { id: 'auth', label: 'Auth Events' },
  { id: 'sessions', label: 'User Sessions' },
];

function csvEscape(value: any) {
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv(filename: string, rows: any[]) {
  if (!rows.length) return;
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const csv = [keys.join(','), ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function statusClass(status: any) {
  const code = Number(status || 0);
  if (code >= 500) return 'border border-rose-200 bg-rose-50 text-rose-700';
  if (code >= 400) return 'border border-amber-200 bg-amber-50 text-amber-700';
  if (code >= 200) return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border border-slate-200 bg-slate-100 text-slate-700';
}

function methodClass(method: string) {
  if (method === 'GET') return 'border border-sky-200 bg-sky-50 text-sky-700';
  if (method === 'POST') return 'border border-violet-200 bg-violet-50 text-violet-700';
  if (method === 'DELETE') return 'border border-rose-200 bg-rose-50 text-rose-700';
  return 'border border-slate-200 bg-slate-100 text-slate-700';
}

export default function AdminLogsPage() {
  const { user, globalRole, selectedOrgId } = useAuth();
  const [tab, setTab] = useState<Tab>('activity');
  const [range, setRange] = useState('24h');
  const [live, setLive] = useState(true);
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const [resolved, setResolved] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startDate = useMemo(() => {
    const hours = range === '1h' ? 1 : range === '7d' ? 24 * 7 : range === '30d' ? 24 * 30 : 24;
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  }, [range]);

  const effectiveTab = tab === 'sessions' ? 'activity' : tab;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        start_date: startDate,
        limit: tab === 'sessions' ? 100 : 50,
        search,
      };
      if (selectedOrgId) params.organization_id = selectedOrgId;
      if (eventType) params.event_type = eventType;
      if (tab === 'errors' && resolved) params.resolved = resolved;
      if (tab === 'sessions') {
        params.start_date = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      }
      const [list, stats] = await Promise.all([
        getAdminLogs(effectiveTab, params, user?.id),
        getAdminLogsSummary(selectedOrgId ? { organization_id: selectedOrgId } : {}, user?.id),
      ]);
      setSummary(stats || {});
      const items = list.items || [];
      if (tab === 'sessions') {
        const bySession = new Map<string, any>();
        for (const item of items) {
          const key = item.session_id || item.user_id || item.id;
          const existing = bySession.get(key);
          if (!existing || new Date(item.created_at) > new Date(existing.created_at)) bySession.set(key, item);
        }
        setRows(Array.from(bySession.values()));
      } else {
        setRows(items);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!['platform_admin', 'admin', 'super_admin'].includes(String(globalRole || ''))) return;
    void load();
    if (!live) return;
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [tab, range, live, search, eventType, resolved, selectedOrgId, globalRole]);

  const topPages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of tab === 'pageviews' ? rows : []) counts.set(row.page, (counts.get(row.page) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [rows, tab]);

  const avgResponse = useMemo(() => {
    const apiRows = tab === 'api' ? rows : [];
    if (!apiRows.length) return 0;
    return Math.round(apiRows.reduce((sum, row) => sum + Number(row.response_time_ms || 0), 0) / apiRows.length);
  }, [rows, tab]);

  if (!['platform_admin', 'admin', 'super_admin'].includes(String(globalRole || ''))) {
    return (
      <PageLayout title="Admin Logs" eyebrow="Admin" description="Protected audit and observability logs">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">You do not have permission to view logs.</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Admin Logs"
      eyebrow="Admin"
      description="Activity, page views, errors, API timings, auth events, and active sessions."
      actions={
        <div className="flex flex-wrap gap-2">
          <button data-log="Export Admin Logs CSV" className="vs-button-secondary" onClick={() => exportCsv(`victorysync-${tab}-logs.csv`, rows)}>Export CSV</button>
          <button data-log="Refresh Admin Logs" className="vs-button-primary" onClick={() => void load()}>Refresh</button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Total events today', summary.total_events_today || 0],
          ['Active users now', summary.active_users_now || 0],
          ['Unresolved errors', summary.unresolved_errors || 0],
          ['Avg API response', `${summary.avg_api_response_time_ms || 0}ms`],
          ['Failed logins 1h', summary.failed_logins_last_hour || 0],
        ].map(([label, value]) => (
          <div key={label} className="vs-surface p-4">
            <div className="text-xs font-bold uppercase text-slate-600">{label}</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <select className="vs-input h-10" value={range} onChange={(e) => setRange(e.target.value)} data-log="Changed Logs Date Range">
            <option value="1h">Last 1 hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <input className="vs-input h-10 min-w-[220px]" placeholder="Search logs" value={search} onChange={(e) => setSearch(e.target.value)} />
          {tab !== 'api' && tab !== 'pageviews' && (
            <input className="vs-input h-10" placeholder="Event/error type" value={eventType} onChange={(e) => setEventType(e.target.value)} />
          )}
          {tab === 'errors' && (
            <select className="vs-input h-10" value={resolved} onChange={(e) => setResolved(e.target.value)}>
              <option value="">All errors</option>
              <option value="false">Unresolved</option>
              <option value="true">Resolved</option>
            </select>
          )}
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Live refresh
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {tabs.map((next) => (
            <button
              key={next.id}
              data-log={`Switched Logs Tab ${next.label}`}
              className={tab === next.id ? 'vs-button-primary' : 'vs-button-secondary'}
              onClick={() => setTab(next.id)}
            >
              {next.label}
              {next.id === 'errors' && Number(summary.unresolved_errors || 0) > 0 ? ` (${summary.unresolved_errors})` : ''}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">{error}</div>}
      {tab === 'auth' && Number(summary.failed_logins_last_hour || 0) > 10 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-700">High failed login volume detected in the last hour.</div>
      )}
      {tab === 'api' && avgResponse > 1000 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-700">Current filtered API average is over 1000ms.</div>
      )}
      {tab === 'pageviews' && topPages.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-950">Top visited pages</div>
          <div className="space-y-2">
            {topPages.map(([page, count]) => (
              <div key={page} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                <div className="truncate text-slate-700">{page}</div>
                <div className="h-2 min-w-[180px] rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-cyan-400" style={{ width: `${Math.max(8, Math.min(100, count * 12))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="vs-table-shell mt-4 overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">{loading ? 'Loading...' : `${rows.length} rows`}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                {tab === 'activity' && ['Event', 'Type', 'Page', 'Element', 'User', 'Org', 'Time'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                {tab === 'pageviews' && ['User', 'Org', 'Page', 'Title', 'Time on page', 'Timestamp'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                {tab === 'errors' && ['Type', 'Message', 'Endpoint', 'Status', 'User', 'Resolved', 'Time'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                {tab === 'api' && ['Method', 'Endpoint', 'Status', 'Response', 'User', 'Time'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                {tab === 'auth' && ['Event', 'Email', 'IP Hash', 'Failure', 'Time'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                {tab === 'sessions' && ['User', 'Org', 'Current Page', 'Last Activity', 'Session'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <tr className="cursor-pointer hover:bg-violet-50/40" onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}>
                    {tab === 'activity' && <>
                      <td className="px-4 py-3 text-slate-900">{row.event_name}</td><td className="px-4 py-3 text-slate-700">{row.event_type}</td><td className="px-4 py-3 text-slate-700">{row.page || '-'}</td><td className="px-4 py-3 text-slate-700">{row.element || '-'}</td><td className="px-4 py-3 text-slate-600">{row.user_id || '-'}</td><td className="px-4 py-3 text-slate-600">{row.organization_id || '-'}</td><td className="px-4 py-3 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                    </>}
                    {tab === 'pageviews' && <>
                      <td className="px-4 py-3 text-slate-600">{row.user_id || '-'}</td><td className="px-4 py-3 text-slate-600">{row.organization_id || '-'}</td><td className="px-4 py-3 text-slate-900">{row.page}</td><td className="px-4 py-3 text-slate-700">{row.page_title || '-'}</td><td className="px-4 py-3 text-slate-700">{row.time_on_page_seconds ?? 0}s</td><td className="px-4 py-3 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                    </>}
                    {tab === 'errors' && <>
                      <td className="px-4 py-3 text-slate-700">{row.error_type}</td><td className="max-w-[320px] truncate px-4 py-3 text-slate-900">{row.error_message}</td><td className="px-4 py-3 text-slate-700">{row.endpoint || '-'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${statusClass(row.http_status)}`}>{row.http_status || '-'}</span></td><td className="px-4 py-3 text-slate-600">{row.user_id || '-'}</td><td className="px-4 py-3"><button className={row.resolved ? 'text-emerald-700' : 'text-rose-700'} onClick={(e) => { e.stopPropagation(); void updateErrorLogResolved(row.id, !row.resolved, user?.id).then(load); }}>{row.resolved ? 'Resolved' : 'Mark Resolved'}</button></td><td className="px-4 py-3 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                    </>}
                    {tab === 'api' && <>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${methodClass(row.method)}`}>{row.method}</span></td><td className="px-4 py-3 text-slate-900">{row.endpoint}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${statusClass(row.status_code)}`}>{row.status_code}</span></td><td className={`px-4 py-3 ${Number(row.response_time_ms || 0) > 1000 ? 'text-amber-700' : 'text-slate-700'}`}>{row.response_time_ms}ms</td><td className="px-4 py-3 text-slate-600">{row.user_id || '-'}</td><td className="px-4 py-3 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                    </>}
                    {tab === 'auth' && <>
                      <td className={`px-4 py-3 ${['login_failed', 'account_locked'].includes(row.event_type) ? 'text-rose-700' : 'text-emerald-700'}`}>{row.event_type}</td><td className="px-4 py-3 text-slate-900">{row.email || '-'}</td><td className="px-4 py-3 text-slate-600">{row.ip_address?.slice(0, 16) || '-'}</td><td className="px-4 py-3 text-slate-700">{row.failure_reason || '-'}</td><td className="px-4 py-3 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                    </>}
                    {tab === 'sessions' && <>
                      <td className="px-4 py-3 text-slate-900">{row.user_id || '-'}</td><td className="px-4 py-3 text-slate-600">{row.organization_id || '-'}</td><td className="px-4 py-3 text-slate-700">{row.page || '-'}</td><td className="px-4 py-3 text-slate-600">{new Date(row.created_at).toLocaleString()}</td><td className="px-4 py-3 text-slate-600">{row.session_id || '-'}</td>
                    </>}
                  </tr>
                  {expandedId === row.id && (
                    <tr>
                      <td colSpan={8} className="bg-slate-50 px-4 py-3">
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify(row.metadata || row.request_payload || row, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {!rows.length && !loading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-600">No logs found for this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}
