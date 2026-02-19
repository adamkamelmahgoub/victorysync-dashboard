import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';

type ReportRow = {
  id: string;
  org_id: string;
  report_type: string;
  report_date?: string;
  created_at?: string;
  from_number?: string;
  to_number?: string;
  numbers_called?: string[];
  data?: {
    calls_count?: number;
    answered_count?: number;
    missed_count?: number;
    sample_numbers?: string[];
  };
};

type ReportDetailResponse = {
  report: ReportRow;
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

const PAGE_SIZE = 500;

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

export default function ReportPage() {
  const { user, globalRole } = useAuth();
  const { org } = useOrg();

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('calls');
  const [nextOffset, setNextOffset] = useState<number | null>(0);

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'calls' | 'recordings' | 'sms'>('calls');

  const isAdmin = globalRole === 'platform_admin';

  const rowNumbers = (r: ReportRow) => {
    const values = [
      ...(r.numbers_called || []),
      ...(r.data?.sample_numbers || []),
      r.from_number || '',
      r.to_number || ''
    ].map((v) => String(v || '').trim()).filter(Boolean);
    return Array.from(new Set(values));
  };

  const summary = useMemo(() => {
    const totalReports = reports.length;
    const totalCalls = reports.reduce((a, r) => a + Number(r.data?.calls_count || 0), 0);
    const answered = reports.reduce((a, r) => a + Number(r.data?.answered_count || 0), 0);
    const missed = reports.reduce((a, r) => a + Number(r.data?.missed_count || 0), 0);
    return { totalReports, totalCalls, answered, missed };
  }, [reports]);

  const loadReports = async (reset = false) => {
    if (!user) return;
    if (!reset && nextOffset == null) return;

    const activeOffset = reset ? 0 : (nextOffset ?? 0);

    try {
      if (reset) {
        setLoading(true);
        setListError(null);
      } else {
        setLoadingMore(true);
      }

      let url = buildApiUrl(`/api/mightycall/reports?type=${encodeURIComponent(filterType)}&limit=${PAGE_SIZE}&offset=${activeOffset}`);
      if (!isAdmin && org?.id) url += `&org_id=${encodeURIComponent(org.id)}`;

      const response = await fetch(url, {
        headers: { 'x-user-id': user.id, 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setListError(err?.detail || err?.error || 'Failed to load reports');
        return;
      }

      const data = await response.json();
      const rows: ReportRow[] = data.reports || [];
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
    if (!user) return;
    setSelectedReportId(reportId);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setDetailTab('calls');

    try {
      const response = await fetch(buildApiUrl(`/api/mightycall/reports/${encodeURIComponent(reportId)}?related_limit=5000`), {
        headers: { 'x-user-id': user.id, 'Content-Type': 'application/json' }
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

  useEffect(() => { loadReports(true); }, [user?.id, filterType, org?.id, isAdmin]);
  useEffect(() => {
    if (selectedReportId) openDetail(selectedReportId);
  }, [selectedReportId]);

  return (
    <PageLayout title="Reports" description="Your assigned-number report analytics and drill-down">
      <div className="space-y-6">
        <section className="vs-surface p-5">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-2">Report Type</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
                <option value="calls">Calls</option>
                <option value="messages">Messages</option>
                <option value="analytics">Analytics</option>
              </select>
            </div>
            <div className="md:col-span-2 text-xs text-slate-400">Scope: {isAdmin ? 'Platform-wide' : 'Assigned numbers only'}</div>
            <button onClick={() => loadReports(true)} disabled={loading} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60">{loading ? 'Refreshing...' : 'Refresh'}</button>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="vs-surface p-4"><div className="text-xs text-slate-400">Reports</div><div className="text-2xl text-white font-bold">{summary.totalReports}</div></div>
          <div className="vs-surface p-4"><div className="text-xs text-slate-400">Total Calls</div><div className="text-2xl text-white font-bold">{summary.totalCalls}</div></div>
          <div className="vs-surface p-4"><div className="text-xs text-slate-400">Answered</div><div className="text-2xl text-emerald-300 font-bold">{summary.answered}</div></div>
          <div className="vs-surface p-4"><div className="text-xs text-slate-400">Missed</div><div className="text-2xl text-amber-300 font-bold">{summary.missed}</div></div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 vs-surface p-0 overflow-hidden">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-200">Report List</div>
            {listError ? (
              <div className="px-4 py-8 text-sm text-rose-300">{listError}</div>
            ) : loading ? (
              <div className="px-4 py-8 text-sm text-slate-400">Loading reports...</div>
            ) : reports.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-400">No reports found.</div>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="text-left py-2 px-3">Type</th>
                      <th className="text-left py-2 px-3">Calls</th>
                      <th className="text-left py-2 px-3">Answered</th>
                      <th className="text-left py-2 px-3">Missed</th>
                      <th className="text-left py-2 px-3">Numbers Called</th>
                      <th className="text-left py-2 px-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {reports.map((r) => (
                      <tr key={r.id} onClick={() => setSelectedReportId(r.id)} className={`cursor-pointer ${selectedReportId === r.id ? 'bg-cyan-500/10' : 'hover:bg-slate-800/40'}`}>
                        <td className="py-2 px-3 text-slate-200">{r.report_type || '-'}</td>
                        <td className="py-2 px-3 text-slate-200">{r.data?.calls_count ?? '-'}</td>
                        <td className="py-2 px-3 text-emerald-300">{r.data?.answered_count ?? '-'}</td>
                        <td className="py-2 px-3 text-amber-300">{r.data?.missed_count ?? '-'}</td>
                        <td className="py-2 px-3 text-xs font-mono text-slate-300 max-w-[260px] truncate">{rowNumbers(r).join(', ') || '-'}</td>
                        <td className="py-2 px-3 text-xs text-slate-500">{fmtDate(r.report_date || r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {nextOffset !== null && (
                  <div className="p-3 border-t border-slate-800 flex justify-center">
                    <button onClick={() => loadReports(false)} disabled={loadingMore} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-60">{loadingMore ? 'Loading...' : 'Load more'}</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="xl:col-span-5 vs-surface p-4">
            <div className="mb-3 text-sm font-semibold text-slate-200">Report Detail</div>
            {detailLoading ? (
              <div className="text-sm text-slate-400">Loading detail...</div>
            ) : detailError ? (
              <div className="text-sm text-rose-300">{detailError}</div>
            ) : !detail ? (
              <div className="text-sm text-slate-400">Select a report to view details.</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border border-slate-700 bg-slate-800/50 p-3"><div className="text-xs text-slate-400">Total Calls</div><div className="text-xl text-white font-bold">{detail.kpis.total_calls}</div></div>
                  <div className="rounded border border-slate-700 bg-slate-800/50 p-3"><div className="text-xs text-slate-400">Answer Rate</div><div className="text-xl text-cyan-300 font-bold">{detail.kpis.answer_rate_pct}%</div></div>
                  <div className="rounded border border-slate-700 bg-slate-800/50 p-3"><div className="text-xs text-slate-400">Answered</div><div className="text-xl text-emerald-300 font-bold">{detail.kpis.answered_calls}</div></div>
                  <div className="rounded border border-slate-700 bg-slate-800/50 p-3"><div className="text-xs text-slate-400">Missed</div><div className="text-xl text-amber-300 font-bold">{detail.kpis.missed_calls}</div></div>
                </div>

                <div className="rounded border border-slate-700 bg-slate-800/40 p-3">
                  <div className="text-xs text-slate-400 mb-2">Numbers Called</div>
                  <div className="text-xs font-mono text-slate-200 break-words">{(detail.all_numbers_called || detail.numbers || []).join(', ') || '-'}</div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setDetailTab('calls')} className={`rounded px-2.5 py-1 text-xs ${detailTab === 'calls' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Calls ({detail.related.calls.length})</button>
                  <button onClick={() => setDetailTab('recordings')} className={`rounded px-2.5 py-1 text-xs ${detailTab === 'recordings' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}>Recordings ({detail.related.recordings.length})</button>
                  <button onClick={() => setDetailTab('sms')} className={`rounded px-2.5 py-1 text-xs ${detailTab === 'sms' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}>SMS ({detail.related.sms.length})</button>
                </div>

                <div className="max-h-[38vh] overflow-auto rounded border border-slate-700">
                  {detailTab === 'calls' && (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-700/60"><tr><th className="text-left py-2 px-2">From</th><th className="text-left py-2 px-2">To</th><th className="text-left py-2 px-2">Status</th><th className="text-left py-2 px-2">Duration</th><th className="text-left py-2 px-2">Started</th></tr></thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {detail.related.calls.length === 0 ? (
                          <tr><td className="px-2 py-3 text-slate-400" colSpan={5}>No related calls found for this report.</td></tr>
                        ) : detail.related.calls.slice(0, 500).map((c) => (
                          <tr key={c.id}><td className="px-2 py-2 font-mono text-slate-200">{c.from_number || '-'}</td><td className="px-2 py-2 font-mono text-slate-200">{c.to_number || '-'}</td><td className="px-2 py-2 text-slate-300">{c.status || '-'}</td><td className="px-2 py-2 text-slate-300">{fmtSeconds(Number(c.duration_seconds || 0))}</td><td className="px-2 py-2 text-slate-400">{fmtDate(c.started_at)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {detailTab === 'recordings' && (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-700/60"><tr><th className="text-left py-2 px-2">From</th><th className="text-left py-2 px-2">To</th><th className="text-left py-2 px-2">Duration</th><th className="text-left py-2 px-2">Date</th></tr></thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {detail.related.recordings.length === 0 ? (
                          <tr><td className="px-2 py-3 text-slate-400" colSpan={4}>No related recordings found for this report.</td></tr>
                        ) : detail.related.recordings.slice(0, 500).map((r) => (
                          <tr key={r.id}><td className="px-2 py-2 font-mono text-slate-200">{r.from_number || '-'}</td><td className="px-2 py-2 font-mono text-slate-200">{r.to_number || '-'}</td><td className="px-2 py-2 text-slate-300">{fmtSeconds(Number(r.duration_seconds || 0))}</td><td className="px-2 py-2 text-slate-400">{fmtDate(r.recording_date)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {detailTab === 'sms' && (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-700/60"><tr><th className="text-left py-2 px-2">From</th><th className="text-left py-2 px-2">To</th><th className="text-left py-2 px-2">Direction</th><th className="text-left py-2 px-2">Date</th></tr></thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {detail.related.sms.length === 0 ? (
                          <tr><td className="px-2 py-3 text-slate-400" colSpan={4}>No related SMS found for this report.</td></tr>
                        ) : detail.related.sms.slice(0, 500).map((s) => (
                          <tr key={s.id}><td className="px-2 py-2 font-mono text-slate-200">{s.from_number || '-'}</td><td className="px-2 py-2 font-mono text-slate-200">{s.to_number || '-'}</td><td className="px-2 py-2 text-slate-300">{s.direction || '-'}</td><td className="px-2 py-2 text-slate-400">{fmtDate(s.created_at)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
