import React, { FC, useEffect, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';
import { useRealtimeSubscription } from '../../lib/realtimeSubscriptions';

interface Report {
  id: string;
  org_id: string;
  report_type: string;
  report_date: string;
  created_at: string;
  data?: {
    calls_count?: number;
    answered_count?: number;
    missed_count?: number;
    sample_numbers?: string[];
  };
  organizations?: { name: string; id: string };
}

interface Org {
  id: string;
  name: string;
}

interface ReportDetailResponse {
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
  related: {
    calls: any[];
    recordings: any[];
    sms: any[];
  };
}

const PAGE_SIZE = 500;

const AdminReportsPage: FC = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const [reports, setReports] = useState<Report[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterOrgId, setFilterOrgId] = useState('');
  const [filterType, setFilterType] = useState('calls');
  const [syncing, setSyncing] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<ReportDetailResponse | null>(null);

  useEffect(() => {
    fetchOrgs();
  }, []);

  useEffect(() => {
    loadReports(true);
  }, [filterOrgId, filterType, userId]);

  useRealtimeSubscription(
    'calls',
    filterOrgId || null,
    () => loadReports(true),
    () => loadReports(true),
    () => loadReports(true)
  );

  const fetchOrgs = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/admin/orgs'), {
        headers: {
          'x-user-id': userId || '',
          'x-dev-bypass': 'true'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setOrgs(data.orgs || []);
      }
    } catch (error) {
      console.error('Error fetching orgs:', error);
    }
  };

  const loadReports = async (reset = false) => {
    const activeOffset = reset ? 0 : (nextOffset ?? 0);
    if (!userId) return;
    if (!reset && nextOffset == null) return;

    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      let url = buildApiUrl(`/api/mightycall/reports?type=${encodeURIComponent(filterType)}&limit=${PAGE_SIZE}&offset=${activeOffset}`);
      if (filterOrgId) {
        url += `&org_id=${encodeURIComponent(filterOrgId)}`;
      }

      const response = await fetch(url, {
        headers: {
          'x-user-id': userId,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch reports');
        return;
      }

      const data = await response.json();
      const rows: Report[] = data.reports || [];
      setReports((prev) => (reset ? rows : [...prev, ...rows]));
      setNextOffset(data.next_offset ?? null);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  const handleSync = async () => {
    if (!filterOrgId) {
      alert('Please select an organization to sync');
      return;
    }

    setSyncing(true);
    try {
      const response = await fetch(buildApiUrl('/api/mightycall/sync/reports'), {
        method: 'POST',
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId: filterOrgId,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Sync failed: ${errorData.error || 'Unknown error'}`);
        return;
      }

      const data = await response.json();
      alert(`Successfully synced ${data.reports_synced || 0} reports`);
      setTimeout(() => loadReports(true), 500);
    } catch (error: any) {
      console.error('Error syncing:', error);
      alert(`Failed to sync: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const openReportDetail = async (reportId: string) => {
    if (!userId) return;
    setSelectedReportId(reportId);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await fetch(buildApiUrl(`/api/mightycall/reports/${encodeURIComponent(reportId)}`), {
        headers: {
          'x-user-id': userId,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setDetailError(err?.detail || err?.error || 'Failed to load report detail');
        return;
      }
      const data = await response.json();
      setReportDetail(data);
    } catch (e: any) {
      setDetailError(e?.message || 'Failed to load report detail');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <PageLayout title="Reports" description="View and manage MightyCall reports across organizations">
      <div className="space-y-6">
        <AdminTopNav />

        <div className="bg-slate-900/80 ring-1 ring-slate-800 p-6 rounded-lg">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Organization</label>
              <select
                value={filterOrgId}
                onChange={(e) => setFilterOrgId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-50 text-sm"
              >
                <option value="">All Organizations</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Report Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-50 text-sm"
              >
                <option value="calls">Calls</option>
                <option value="messages">Messages</option>
                <option value="analytics">Analytics</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="w-full px-4 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:from-emerald-500 hover:to-cyan-500 transition"
              >
                {syncing ? 'Syncing...' : 'Sync Reports'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 ring-1 ring-slate-800 p-6 rounded-lg">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Reports ({reports.length})</h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 mb-2"></div>
              <div className="text-slate-400 text-sm">Loading reports...</div>
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">No reports found</div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700/50">
                    <tr className="text-slate-400">
                      <th className="text-left py-3 px-4 font-semibold">Organization</th>
                      <th className="text-left py-3 px-4 font-semibold">Type</th>
                      <th className="text-left py-3 px-4 font-semibold">Calls</th>
                      <th className="text-left py-3 px-4 font-semibold">Answered</th>
                      <th className="text-left py-3 px-4 font-semibold">Missed</th>
                      <th className="text-left py-3 px-4 font-semibold">Number(s)</th>
                      <th className="text-left py-3 px-4 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {reports.map((report) => (
                      <tr
                        key={report.id}
                        className="hover:bg-slate-800/30 transition cursor-pointer"
                        onClick={() => openReportDetail(report.id)}
                      >
                        <td className="py-3 px-4 text-slate-200">{report.organizations?.name || report.org_id}</td>
                        <td className="py-3 px-4 text-slate-300">{report.report_type}</td>
                        <td className="py-3 px-4 text-slate-300">{report.data?.calls_count ?? '-'}</td>
                        <td className="py-3 px-4 text-emerald-300">{report.data?.answered_count ?? '-'}</td>
                        <td className="py-3 px-4 text-amber-300">{report.data?.missed_count ?? '-'}</td>
                        <td className="py-3 px-4 text-slate-400 text-xs font-mono">{(report.data?.sample_numbers || []).join(', ') || '-'}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{new Date(report.report_date || report.created_at).toLocaleDateString()}</td>
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
          <div className="w-full max-w-5xl bg-slate-900 ring-1 ring-slate-700 rounded-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Report Detail</h3>
              <button
                onClick={() => { setSelectedReportId(null); setReportDetail(null); setDetailError(null); }}
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
              ) : reportDetail ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Total Calls</div><div className="text-xl text-white font-bold">{reportDetail.kpis.total_calls}</div></div>
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Answered</div><div className="text-xl text-emerald-300 font-bold">{reportDetail.kpis.answered_calls}</div></div>
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Missed</div><div className="text-xl text-amber-300 font-bold">{reportDetail.kpis.missed_calls}</div></div>
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Answer Rate</div><div className="text-xl text-cyan-300 font-bold">{reportDetail.kpis.answer_rate_pct}%</div></div>
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Total Duration</div><div className="text-xl text-white font-bold">{reportDetail.kpis.total_duration_seconds}s</div></div>
                    <div className="bg-slate-800/60 border border-slate-700 rounded p-4"><div className="text-xs text-slate-400">Avg Duration</div><div className="text-xl text-white font-bold">{reportDetail.kpis.avg_call_duration_seconds}s</div></div>
                  </div>

                  <div className="bg-slate-800/50 border border-slate-700 rounded p-4">
                    <div className="text-xs text-slate-400 mb-2">Numbers In This Report</div>
                    <div className="text-sm text-slate-200 font-mono break-words">{(reportDetail.numbers || []).join(', ') || '-'}</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-800/50 border border-slate-700 rounded p-4">
                      <div className="text-xs text-slate-400 mb-2">Related Calls</div>
                      <div className="text-lg text-white font-semibold">{reportDetail.related?.calls?.length || 0}</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700 rounded p-4">
                      <div className="text-xs text-slate-400 mb-2">Related Recordings</div>
                      <div className="text-lg text-white font-semibold">{reportDetail.related?.recordings?.length || 0}</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700 rounded p-4">
                      <div className="text-xs text-slate-400 mb-2">Related SMS</div>
                      <div className="text-lg text-white font-semibold">{reportDetail.related?.sms?.length || 0}</div>
                    </div>
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
};

export default AdminReportsPage;
