import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import { buildApiUrl } from '../config';

interface CallStats {
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  avgHandleTime: number; // AHT in seconds
  avgWaitTime: number; // AWT in seconds
  totalDuration: number;
  avgDuration: number;
  answerRate: number; // percentage
  totalRevenue: number;
  avgRevenue: number;
}

export default function ReportsPageEnhanced() {
  const { user, selectedOrgId, orgs, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<CallStats | null>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  // Initialize org from auth context
  useEffect(() => {
    if (selectedOrgId) {
      setSelectedOrg(selectedOrgId);
    } else if (!authLoading && orgs.length > 0) {
      setSelectedOrg(orgs[0].id);
    }
  }, [selectedOrgId, orgs, authLoading]);

  // Fetch data when org is set or date range changes
  useEffect(() => {
    if (selectedOrg && user) {
      fetchCallStats();
    }
  }, [selectedOrg, startDate, endDate, user]);

  const fetchCallStats = async () => {
    if (!selectedOrg || !user) {
      console.log('Skipping fetch: selectedOrg=', selectedOrg, 'user=', user?.id);
      return;
    }
    setLoading(true);
    setMessage(null);
    console.log(`Fetching call-stats for org=${selectedOrg}, user=${user.id}`);
    try {
      const url = buildApiUrl(`/api/call-stats?org_id=${selectedOrg}&start_date=${startDate}&end_date=${endDate}`);
      const response = await fetch(url, { 
        headers: { 'x-user-id': user.id },
        cache: 'no-store'
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Received call-stats:', data);
        setStats(data.stats);
        setCalls(data.calls || []);
      } else {
        const errorText = await response.text();
        console.error('Response error:', response.status, errorText);
        setMessage(`Failed to fetch call statistics (${response.status})`);
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      setMessage(err?.message || 'Error fetching statistics');
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, unit, color }: any) => (
    <div className="bg-gradient-to-br from-slate-800/50 to-slate-900 rounded-lg p-4 ring-1 ring-slate-700 hover:ring-slate-600 transition">
      <p className="text-xs font-semibold text-slate-400 uppercase mb-2">{title}</p>
      <p className={`text-2xl font-bold ${color}`}>
        {typeof value === 'number' ? value.toFixed(value > 100 ? 0 : 1) : value}
        <span className="text-sm text-slate-400 ml-1">{unit}</span>
      </p>
    </div>
  );

  return (
    <PageLayout title="Reports & Analytics" description="Call statistics and KPIs">
      <div className="space-y-6">
        {authLoading ? (
          <div className="bg-slate-900/80 rounded-xl p-8 ring-1 ring-slate-800 text-center">
            <p className="text-slate-300">Loading organizations...</p>
          </div>
        ) : !selectedOrg ? (
          <div className="bg-slate-900/80 rounded-xl p-8 ring-1 ring-slate-800 text-center">
            <p className="text-slate-300">No organization selected</p>
            <p className="text-sm text-slate-500 mt-2">Select an organization from the admin panel to view reports.</p>
          </div>
        ) : (
          <>
            {/* Date Filter */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <h3 className="text-sm font-semibold text-white mb-4">Date Range</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
                  />
                </div>
              </div>
              {message && (
                <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-sm text-slate-300">{message}</p>
                </div>
              )}
            </div>

            {/* KPI Cards */}
            {loading ? (
              <div className="p-8 text-center">
                <p className="text-slate-400">Loading statistics...</p>
              </div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    title="Total Calls"
                    value={stats.totalCalls}
                    unit="calls"
                    color="text-cyan-400"
                  />
                  <StatCard
                    title="Answer Rate"
                    value={stats.answerRate}
                    unit="%"
                    color="text-emerald-400"
                  />
                  <StatCard
                    title="Avg Handle Time"
                    value={Math.floor(stats.avgHandleTime / 60)}
                    unit="min"
                    color="text-orange-400"
                  />
                  <StatCard
                    title="Avg Wait Time"
                    value={Math.floor(stats.avgWaitTime)}
                    unit="sec"
                    color="text-amber-400"
                  />
                  <StatCard
                    title="Answered Calls"
                    value={stats.answeredCalls}
                    unit="calls"
                    color="text-emerald-400"
                  />
                  <StatCard
                    title="Missed Calls"
                    value={stats.missedCalls}
                    unit="calls"
                    color="text-red-400"
                  />
                  <StatCard
                    title="Avg Call Duration"
                    value={Math.floor(stats.avgDuration / 60)}
                    unit="min"
                    color="text-violet-400"
                  />
                  <StatCard
                    title="Total Revenue"
                    value={stats.totalRevenue}
                    unit="$"
                    color="text-green-400"
                  />
                </div>

                {/* Calls Table */}
                <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
                  <h2 className="text-lg font-semibold text-white mb-6">Recent Calls</h2>
                  {calls.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-slate-400">No calls found in this period.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">From</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">To</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Status</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300">Duration</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">Revenue</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calls.slice(0, 100).map((call: any) => {
                            // Use actual recording date if available, fallback to started_at
                            const callDate = call.recording_date || call.started_at || call.date;
                            const duration = call.duration_seconds || 0;
                            
                            return (
                              <tr key={call.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition">
                                <td className="px-4 py-3 text-white font-medium">{call.from_number || '—'}</td>
                                <td className="px-4 py-3 text-white">{call.to_number || '—'}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                                    call.status === 'answered' || call.status === 'Answered' ? 'bg-emerald-900/40 text-emerald-300' :
                                    call.status === 'missed' || call.status === 'Missed' ? 'bg-red-900/40 text-red-300' :
                                    'bg-slate-900/40 text-slate-300'
                                  }`}>
                                    {call.status || 'Unknown'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center text-slate-300">
                                  {Math.floor(duration / 60)}m {duration % 60}s
                                </td>
                                <td className="px-4 py-3 text-right text-slate-300">
                                  ${(call.revenue_generated || 0).toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-slate-400 text-xs">
                                  {callDate ? new Date(callDate).toLocaleString() : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-8 text-center">
                <p className="text-slate-400">No data available</p>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
