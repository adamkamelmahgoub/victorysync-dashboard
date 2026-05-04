import React, { FC, useEffect, useMemo, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../../components/DashboardPrimitives';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';
import { triggerMightyCallReportsSync } from '../../lib/apiClient';

type Report = {
  id: string;
  org_id: string;
  report_type: string;
  report_date?: string;
  created_at?: string;
  from_number?: string;
  to_number?: string;
  numbers_called?: string[];
  organizations?: { name: string; id: string };
  data?: {
    calls_count?: number;
    answered_count?: number;
    missed_count?: number;
    sample_numbers?: string[];
  };
};

type Org = { id: string; name: string };

type ReportDetailResponse = {
  report: Report;
  kpis: {
    total_calls: number;
    answered_calls: number;
    missed_calls: number;
    answer_rate_pct: number;
    total_duration_seconds: number;
    avg_call_duration_seconds: number;
  };
  numbers: string[];
  all_numbers_called?: string[];
  related: {
    calls: Array<{ id: string; from_number?: string; to_number?: string; status?: string; duration_seconds?: number; started_at?: string }>;
    recordings: Array<{ id: string; from_number?: string; to_number?: string; duration_seconds?: number; recording_date?: string; recording_url?: string }>;
    sms: Array<{ id: string; from_number?: string; to_number?: string; direction?: string; status?: string; created_at?: string; message_text?: string }>;
  };
};

function displayNumber(value?: string, fallback?: string) {
  const primary = String(value || '').trim();
  if (primary) return primary;
  const secondary = String(fallback || '').trim();
  return secondary || '-';
}

const PAGE_SIZE = 500;

function isoDateDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function fmtDate(v?: string) {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function fmtSeconds(total: number) {
  const s = Math.max(0, Number(total) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

const AdminReportsPage: FC = () => {
  const { user, selectedOrgId } = useAuth();
  const userId = user?.id;

  const [reports, setReports] = useState<Report[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [filterOrgId, setFilterOrgId] = useState('');
  const [filterType, setFilterType] = useState('calls');
  const [nextOffset, setNextOffset] = useState<number | null>(0);

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'calls' | 'recordings' | 'sms'>('calls');
  const [syncing, setSyncing] = useState(false);

  const summary = useMemo(() => {
    const totalReports = reports.length;
    const totalCalls = reports.reduce((a, r) => a + Number(r.data?.calls_count || 0), 0);
    const answered = reports.reduce((a, r) => a + Number(r.data?.answered_count || 0), 0);
    const missed = reports.reduce((a, r) => a + Number(r.data?.missed_count || 0), 0);
    return { totalReports, totalCalls, answered, missed };
  }, [reports]);

  const rowNumbers = (r: Report) => {
    const values = [
      ...(r.numbers_called || []),
      ...(r.data?.sample_numbers || []),
      r.from_number || '',
      r.to_number || '',
    ].map((v) => String(v || '').trim()).filter(Boolean);
    return Array.from(new Set(values));
  };

  const fetchOrgs = async () => {
    if (!userId) return;
    try {
      const resp = await fetch(buildApiUrl('/api/admin/orgs'), { headers: { 'x-user-id': userId } });
      if (!resp.ok) return;
      const json = await resp.json();
      setOrgs(json.orgs || []);
    } catch {}
  };

  useEffect(() => {
    if (filterOrgId) return;
    if (selectedOrgId) {
      setFilterOrgId(selectedOrgId);
      return;
    }
    if (orgs.length > 0) {
      setFilterOrgId(orgs[0].id);
    }
  }, [selectedOrgId, orgs, filterOrgId]);

  const syncRecentReports = async () => {
    if (!userId || !filterOrgId) return;
    setSyncing(true);
    try {
      await triggerMightyCallReportsSync(filterOrgId, isoDateDaysAgo(2), new Date().toISOString().slice(0, 10), userId);
    } catch (e: any) {
      console.warn('[AdminReportsPage] recent MightyCall sync failed:', e?.message || e);
    } finally {
      setSyncing(false);
    }
  };

  const loadReports = async (reset = false, options?: { syncFirst?: boolean }) => {
    if (!userId) return;
    if (!reset && nextOffset == null) return;
    const activeOffset = reset ? 0 : (nextOffset ?? 0);

    try {
      if (reset) {
        setLoading(true);
        setListError(null);
      } else {
        setLoadingMore(true);
      }

      if (reset && options?.syncFirst && filterOrgId) {
        await syncRecentReports();
      }

      let url = buildApiUrl(`/api/mightycall/reports?type=${encodeURIComponent(filterType)}&limit=${PAGE_SIZE}&offset=${activeOffset}`);
      if (filterOrgId) url += `&org_id=${encodeURIComponent(filterOrgId)}`;

      const response = await fetch(url, { headers: { 'x-user-id': userId, 'Content-Type': 'application/json' } });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setListError(err?.detail || err?.error || 'Failed to load reports');
        return;
      }

      const data = await response.json();
      const rows: Report[] = data.reports || [];
      setReports((prev) => (reset ? rows : [...prev, ...rows]));
      setNextOffset(data.next_offset ?? null);

      if (reset) {
        if (rows.length > 0) setSelectedReportId((prev) => prev || rows[0].id);
        else {
          setSelectedReportId(null);
          setDetail(null);
          setDetailError(null);
        }
      }
    } catch (e: any) {
      setListError(e?.message || 'Failed to load reports');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  const openDetail = async (reportId: string) => {
    if (!userId) return;
    setSelectedReportId(reportId);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setDetailTab('calls');

    try {
      const response = await fetch(buildApiUrl(`/api/mightycall/reports/${encodeURIComponent(reportId)}?related_limit=5000`), {
        headers: { 'x-user-id': userId, 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setDetailError(err?.detail || err?.error || 'Failed to load report detail');
        return;
      }
      const data = await response.json();
      setDetail(data);
    } catch (e: any) {
      setDetailError(e?.message || 'Failed to load report detail');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { fetchOrgs(); }, [userId]);
  useEffect(() => { loadReports(true, { syncFirst: true }); }, [filterOrgId, filterType, userId]);
  useEffect(() => {
    if (selectedReportId) openDetail(selectedReportId);
  }, [selectedReportId]);

  return (
    <PageLayout
      eyebrow="Admin reporting"
      title="Reports Workbench"
      description="Cross-organization operational reporting with KPI bands, report inventory, and call, recording, and SMS drill-down."
      actions={<button onClick={() => loadReports(true, { syncFirst: true })} disabled={loading || syncing} className="vs-button-secondary">{loading || syncing ? 'Refreshing reports...' : 'Refresh'}</button>}
    >
      <div className="space-y-6">
        <AdminTopNav />

        <SectionCard title="Operations report workspace" description="Compare reporting activity across organizations, select a row, then inspect related activity without leaving the admin workspace.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,240px),minmax(0,240px),1fr] md:items-end">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Organization</label>
              <select value={filterOrgId} onChange={(e) => setFilterOrgId(e.target.value)} className="vs-input w-full">
                <option value="">All Organizations</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Report Type</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="vs-input w-full">
                <option value="calls">Calls</option>
                <option value="messages">Messages</option>
                <option value="analytics">Analytics</option>
              </select>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">{syncing ? 'Syncing recent MightyCall activity...' : `Loaded ${reports.length} rows for admin review`}</div>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricStatCard label="Reports" value={summary.totalReports} />
          <MetricStatCard label="Total Calls" value={summary.totalCalls} />
          <MetricStatCard label="Answered" value={summary.answered} accent="emerald" />
          <MetricStatCard label="Missed" value={summary.missed} accent="amber" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <SectionCard title="Report inventory" description="A platform-wide list of report rows, scoped by organization and type." className="xl:col-span-7" contentClassName="p-0">
            {listError ? (
              <div className="px-5 py-10 text-sm text-rose-300">{listError}</div>
            ) : loading ? (
              <div className="px-5 py-10 text-sm text-slate-400">Loading reports...</div>
            ) : reports.length === 0 ? (
              <div className="p-5"><EmptyStatePanel title="No reports found" description="No reporting rows matched the current admin filters." /></div>
            ) : (
              <div className="max-h-[72vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b border-white/8 bg-[rgba(2,6,23,0.96)] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Org</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Calls</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Answered</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Missed</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Numbers</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {reports.map((r) => (
                      <tr key={r.id} onClick={() => setSelectedReportId(r.id)} className={`cursor-pointer transition ${selectedReportId === r.id ? 'bg-cyan-400/[0.08]' : 'hover:bg-white/[0.03]'}`}>
                        <td className="px-4 py-3 text-slate-200">{r.organizations?.name || r.org_id}</td>
                        <td className="px-4 py-3 text-slate-100">{r.data?.calls_count ?? '-'}</td>
                        <td className="px-4 py-3 text-emerald-200">{r.data?.answered_count ?? '-'}</td>
                        <td className="px-4 py-3 text-amber-200">{r.data?.missed_count ?? '-'}</td>
                        <td className="max-w-[260px] truncate px-4 py-3 font-mono text-xs text-slate-400">{rowNumbers(r).join(', ') || '-'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(r.report_date || r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {nextOffset !== null && (
                  <div className="flex justify-center border-t border-white/8 p-4">
                    <button onClick={() => loadReports(false)} disabled={loadingMore} className="vs-button-secondary">
                      {loadingMore ? 'Loading more...' : 'Load more'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Report detail" description="Selected report KPI context and related calls, recordings, and SMS." className="xl:col-span-5">
            {detailLoading ? (
              <div className="text-sm text-slate-400">Loading detail...</div>
            ) : detailError ? (
              <div className="text-sm text-rose-300">{detailError}</div>
            ) : !detail ? (
              <EmptyStatePanel title="No report selected" description="Choose a report row to review its KPI breakdown and related interactions." />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="vs-surface-muted p-4"><div className="text-xs text-slate-500">Total Calls</div><div className="mt-2 text-2xl font-semibold text-white">{detail.kpis.total_calls}</div></div>
                  <div className="vs-surface-muted p-4"><div className="text-xs text-slate-500">Answer Rate</div><div className="mt-2 text-2xl font-semibold text-cyan-200">{detail.kpis.answer_rate_pct}%</div></div>
                  <div className="vs-surface-muted p-4"><div className="text-xs text-slate-500">Answered</div><div className="mt-2 text-2xl font-semibold text-emerald-200">{detail.kpis.answered_calls}</div></div>
                  <div className="vs-surface-muted p-4"><div className="text-xs text-slate-500">Missed</div><div className="mt-2 text-2xl font-semibold text-amber-200">{detail.kpis.missed_calls}</div></div>
                </div>

                <div className="vs-surface-muted p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Numbers called</div>
                  <div className="mt-3 break-words font-mono text-xs text-slate-200">{(detail.all_numbers_called || detail.numbers || []).join(', ') || '-'}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setDetailTab('calls')} className={detailTab === 'calls' ? 'vs-button-primary' : 'vs-button-secondary'}>Calls ({detail.related.calls.length})</button>
                  <button onClick={() => setDetailTab('recordings')} className={detailTab === 'recordings' ? 'vs-button-primary' : 'vs-button-secondary'}>Recordings ({detail.related.recordings.length})</button>
                  <button onClick={() => setDetailTab('sms')} className={detailTab === 'sms' ? 'vs-button-primary' : 'vs-button-secondary'}>SMS ({detail.related.sms.length})</button>
                </div>

                <div className="overflow-auto rounded-3xl border border-white/8">
                  {detailTab === 'calls' && (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 border-b border-white/8 bg-[rgba(2,6,23,0.96)] text-slate-500"><tr><th className="px-3 py-3 text-left">From</th><th className="px-3 py-3 text-left">To</th><th className="px-3 py-3 text-left">Status</th><th className="px-3 py-3 text-left">Duration</th><th className="px-3 py-3 text-left">Started</th></tr></thead>
                      <tbody className="divide-y divide-white/6">
                        {detail.related.calls.length === 0 ? (
                          <tr><td className="px-3 py-4 text-slate-400" colSpan={5}>No related calls found for this report.</td></tr>
                        ) : detail.related.calls.map((c) => (
                          <tr key={c.id}><td className="px-3 py-3 font-mono text-slate-200">{displayNumber(c.from_number, detail.report.from_number)}</td><td className="px-3 py-3 font-mono text-slate-200">{displayNumber(c.to_number, detail.report.to_number)}</td><td className="px-3 py-3"><StatusBadge tone={String(c.status || '').toLowerCase().includes('miss') ? 'warning' : 'neutral'}>{c.status || '-'}</StatusBadge></td><td className="px-3 py-3 text-slate-300">{fmtSeconds(Number(c.duration_seconds || 0))}</td><td className="px-3 py-3 text-slate-500">{fmtDate(c.started_at)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {detailTab === 'recordings' && (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 border-b border-white/8 bg-[rgba(2,6,23,0.96)] text-slate-500"><tr><th className="px-3 py-3 text-left">From</th><th className="px-3 py-3 text-left">To</th><th className="px-3 py-3 text-left">Duration</th><th className="px-3 py-3 text-left">Date</th></tr></thead>
                      <tbody className="divide-y divide-white/6">
                        {detail.related.recordings.length === 0 ? (
                          <tr><td className="px-3 py-4 text-slate-400" colSpan={4}>No related recordings found for this report.</td></tr>
                        ) : detail.related.recordings.map((r) => (
                          <tr key={r.id}><td className="px-3 py-3 font-mono text-slate-200">{displayNumber(r.from_number, detail.report.from_number)}</td><td className="px-3 py-3 font-mono text-slate-200">{displayNumber(r.to_number, detail.report.to_number)}</td><td className="px-3 py-3 text-slate-300">{fmtSeconds(Number(r.duration_seconds || 0))}</td><td className="px-3 py-3 text-slate-500">{fmtDate(r.recording_date)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {detailTab === 'sms' && (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 border-b border-white/8 bg-[rgba(2,6,23,0.96)] text-slate-500"><tr><th className="px-3 py-3 text-left">From</th><th className="px-3 py-3 text-left">To</th><th className="px-3 py-3 text-left">Direction</th><th className="px-3 py-3 text-left">Date</th></tr></thead>
                      <tbody className="divide-y divide-white/6">
                        {detail.related.sms.length === 0 ? (
                          <tr><td className="px-3 py-4 text-slate-400" colSpan={4}>No related SMS found for this report.</td></tr>
                        ) : detail.related.sms.map((s) => (
                          <tr key={s.id}><td className="px-3 py-3 font-mono text-slate-200">{displayNumber(s.from_number, detail.report.from_number)}</td><td className="px-3 py-3 font-mono text-slate-200">{displayNumber(s.to_number, detail.report.to_number)}</td><td className="px-3 py-3 text-slate-300">{s.direction || '-'}</td><td className="px-3 py-3 text-slate-500">{fmtDate(s.created_at)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </PageLayout>
  );
};

export default AdminReportsPage;
