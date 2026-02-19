import React, { useEffect, useState } from 'react';
import { PageLayout } from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';

interface ReportRow {
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
}

interface ReportDetailResponse {
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
}

const PAGE_SIZE = 500;

function formatSeconds(totalSeconds: number) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function formatDate(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

export default function ReportPage() {
  const { user, globalRole } = useAuth();
  const { org } = useOrg();

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterType, setFilterType] = useState('calls');
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const isAdmin = globalRole === 'platform_admin';

  const loadReports = async (reset = false) => {
    if (!user) return;
    if (!reset && nextOffset == null) return;

    const activeOffset = reset ? 0 : (nextOffset ?? 0);

    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      if (reset) setListError(null);

      let url = buildApiUrl(`/api/mightycall/reports?type=${encodeURIComponent(filterType)}&limit=${PAGE_SIZE}&offset=${activeOffset}`);
      if (!isAdmin && org?.id) {
        url += `&org_id=${encodeURIComponent(org.id)}`;
      }

      const response = await fetch(url, {
        headers: {
          'x-user-id': user.id,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setListError(err?.detail || err?.error || 'Failed to fetch reports');
        return;
      }

      const data = await response.json();
      const rows: ReportRow[] = data.reports || [];
      setReports((prev) => (reset ? rows : [...prev, ...rows]));
      setNextOffset(data.next_offset ?? null);
    } catch (e: any) {
      setListError(e?.message || 'Failed to fetch reports');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  const rowNumbers = (report: ReportRow): string[] => {
    const values = [
      ...(report.numbers_called || []),
      ...(report.data?.sample_numbers || []),
      report.from_number || '',
      report.to_number || ''
    ].map((v) => String(v || '').trim()).filter(Boolean);
    return Array.from(new Set(values));
  };

  const openDetail = async (reportId: string) => {
    if (!user) return;
    setSelectedReportId(reportId);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);

    try {
      const response = await fetch(buildApiUrl(`/api/mightycall/reports/${encodeURIComponent(reportId)}?related_limit=5000`), {
        headers: {
          'x-user-id': user.id,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setDetailError(err?.detail || err?.error || 'Failed to load report detail');
        return;
      }

      const data = await response.json();
      setDetail(data);
    } catch (error: any) {
      setDetailError(error?.message || 'Failed to load report detail');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadReports(true);
  }, [user?.id, filterType, org?.id, isAdmin]);

  return (
    <PageLayout title="Reports" description="Detailed call KPIs, numbers called, and report drill-down">
      <div className="space-y-6">
        <div className="vs-surface p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Report Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
              >
                <option value="calls">Calls</option>
                <option value="messages">Messages</option>
                <option value="analytics">Analytics</option>
              </select>
            </div>

            <div className="text-xs text-slate-400">
              {isAdmin ? 'Platform scope' : 'Your assigned numbers only'}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => loadReports(true)}
                disabled={loading}
                className="px-4 py-2 rounded bg-gradient-to-r from-cyan-600 to-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        <div className="vs-surface p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Reports ({reports.length})</h2>

          {listError ? (
            <div className="text-sm text-rose-300 py-8 text-center">{listError}</div>
          ) : loading ? (
            <div className="text-sm text-slate-400 py-8 text-center">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="text-sm text-slate-400 py-8 text-center">No reports found.</div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700/50">
                    <tr className="text-slate-400">
                      <th className="text-left py-3 px-4 font-semibold">Type</th>
                      <th className="text-left py-3 px-4 font-semibold">Total</th>
                      <th className="text-left py-3 px-4 font-semibold">Answered</th>
                      <th className="text-left py-3 px-4 font-semibold">Missed</th>
                      <th className="text-left py-3 px-4 font-semibold">Numbers</th>
                      <th className="text-left py-3 px-4 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {reports.map((report) => (
                      <tr
                        key={report.id}
                        className="hover:bg-slate-800/30 transition cursor-pointer"
                        onClick={() => openDetail(report.id)}
                      >
                        <td className="py-3 px-4 text-slate-200">{report.report_type || '-'}</td>
                        <td className="py-3 px-4 text-slate-200">{report.data?.calls_count ?? '-'}</td>
                        <td className="py-3 px-4 text-emerald-300">{report.data?.answered_count ?? '-'}</td>
                        <td className="py-3 px-4 text-amber-300">{report.data?.missed_count ?? '-'}</td>
                        <td className="py-3 px-4 text-slate-300 text-xs font-mono">{rowNumbers(report).join(', ') || '-'}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{formatDate(report.report_date || report.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nextOffset !== null && (
                <div className="flex justify-center">
                  <button
                    onClick={() => loadReports(false)}
                    disabled={loadingMore}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm hover:bg-slate-700 disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading more...' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedReportId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-slate-900 ring-1 ring-slate-700 rounded-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Report Detail</h3>
              <button
                onClick={() => {
                  setSelectedReportId(null);
                  setDetail(null);
                  setDetailError(null);
                }}
                className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm hover:bg-slate-700"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-6">
              {detailLoading ? (
                <div className="text-slate-300 text-sm">Loading detail...</div>
              ) : detailError ? (
                <div className="text-red-300 text-sm">{detailError}</div>
              ) : detail ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Total Calls</div><div className="text-xl text-white font-bold">{detail.kpis.total_calls}</div></div>
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Answered</div><div className="text-xl text-emerald-300 font-bold">{detail.kpis.answered_calls}</div></div>
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Missed</div><div className="text-xl text-amber-300 font-bold">{detail.kpis.missed_calls}</div></div>
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Answer Rate</div><div className="text-xl text-cyan-300 font-bold">{detail.kpis.answer_rate_pct}%</div></div>
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Total Duration</div><div className="text-xl text-white font-bold">{formatSeconds(detail.kpis.total_duration_seconds)}</div></div>
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Avg Duration</div><div className="text-xl text-white font-bold">{formatSeconds(detail.kpis.avg_call_duration_seconds)}</div></div>
                  </div>

                  <div className="bg-slate-800/50 border border-slate-700 rounded p-4">
                    <div className="text-xs text-slate-400 mb-2">All Numbers In This Report</div>
                    <div className="text-sm text-slate-200 font-mono break-words">
                      {(detail.all_numbers_called || detail.numbers || []).join(', ') || '-'}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-800/50 border border-slate-700 rounded p-4">
                      <div className="text-xs text-slate-400 mb-2">Related Calls</div>
                      <div className="text-lg text-white font-semibold">{detail.related?.calls?.length || 0}</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700 rounded p-4">
                      <div className="text-xs text-slate-400 mb-2">Related Recordings</div>
                      <div className="text-lg text-white font-semibold">{detail.related?.recordings?.length || 0}</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700 rounded p-4">
                      <div className="text-xs text-slate-400 mb-2">Related SMS</div>
                      <div className="text-lg text-white font-semibold">{detail.related?.sms?.length || 0}</div>
                    </div>
                  </div>

                  <div className="bg-slate-800/50 border border-slate-700 rounded p-4">
                    <div className="text-xs text-slate-400 mb-3">Related Calls (From / To / Status / Duration)</div>
                    {detail.related?.calls?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-slate-400 border-b border-slate-700/50">
                            <tr>
                              <th className="text-left py-2 pr-3">From</th>
                              <th className="text-left py-2 pr-3">To</th>
                              <th className="text-left py-2 pr-3">Status</th>
                              <th className="text-left py-2 pr-3">Duration</th>
                              <th className="text-left py-2">Started</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700/30">
                            {detail.related.calls.slice(0, 300).map((c) => (
                              <tr key={c.id} className="text-slate-200">
                                <td className="py-2 pr-3 font-mono">{c.from_number || '-'}</td>
                                <td className="py-2 pr-3 font-mono">{c.to_number || '-'}</td>
                                <td className="py-2 pr-3">{c.status || '-'}</td>
                                <td className="py-2 pr-3">{formatSeconds(Number(c.duration_seconds || 0))}</td>
                                <td className="py-2">{formatDate(c.started_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">No related calls found for this report.</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-slate-300 text-sm">No detail available.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
