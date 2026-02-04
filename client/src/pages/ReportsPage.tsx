import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { triggerMightyCallReportsSync } from '../lib/apiClient';
import { PageLayout } from '../components/PageLayout';
import { buildApiUrl } from '../config';

interface Recording {
  id: string;
  phone_number_id?: string;
  phone_number?: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  status: string;
  started_at: string;
  recording_date?: string;
  from_number?: string;
  to_number?: string;
  call_type?: string;
}

export function ReportsPage() {
  const { user, selectedOrgId, orgs } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dateRange, setDateRange] = useState('week'); // 'today', 'week', 'month', 'all'
  const [directionFilter, setDirectionFilter] = useState('all'); // 'inbound', 'outbound', 'all'
  const [statusFilter, setStatusFilter] = useState('all'); // 'completed', 'failed', 'all'
  const [message, setMessage] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  // Set active org when selectedOrgId or orgs change
  useEffect(() => {
    if (selectedOrgId) {
      setActiveOrgId(selectedOrgId);
    } else if (orgs && orgs.length > 0) {
      // Auto-select first org if no org is selected
      setActiveOrgId(orgs[0].id);
    }
  }, [selectedOrgId, orgs]);

  // Fetch when active org changes
  useEffect(() => {
    if (activeOrgId) {
      fetchRecordings();
    }
  }, [activeOrgId]);

  const fetchRecordings = async () => {
    const orgIdToUse = activeOrgId || selectedOrgId;
    if (!orgIdToUse || !user) return;
    
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(buildApiUrl(`/api/recordings?org_id=${orgIdToUse}&limit=200`), {
        headers: { 'x-user-id': user.id }
      });
      if (response.ok) {
        const data = await response.json();
        const recs = (data.recordings || []).map((r: any) => ({
          ...r,
          direction: r.direction || (r.inbound ? 'inbound' : 'outbound'),
          status: r.status || 'completed',
          started_at: r.recording_date || r.started_at || new Date().toISOString()
        }));
        setRecordings(recs);
        if (recs.length === 0) {
          setMessage('No call recordings found for this organization.');
        }
      } else if (response.status === 403) {
        setMessage('You do not have access to view reports for this organization.');
      } else {
        setMessage('Failed to fetch recordings');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Error fetching recordings');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    const orgIdToUse = activeOrgId || selectedOrgId;
    if (!orgIdToUse || !user) return setMessage('No org selected');
    setSyncing(true);
    setMessage('Syncing reports from MightyCall...');
    try {
      const result: any = await triggerMightyCallReportsSync(orgIdToUse, undefined, undefined, user.id);
      if (result.error) {
        setMessage(`Sync error: ${result.error}`);
      } else {
        setMessage(`Synced ${result.reports_synced || 0} reports`);
      }
      setTimeout(() => fetchRecordings(), 1000);
    } catch (err: any) {
      setMessage(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Filter recordings based on selected criteria
  const getFilteredRecordings = () => {
    let filtered = recordings;

    // Date range filter
    if (dateRange !== 'all') {
      const now = new Date();
      let startDate = new Date();

      if (dateRange === 'today') {
        startDate.setHours(0, 0, 0, 0);
      } else if (dateRange === 'week') {
        startDate.setDate(now.getDate() - 7);
      } else if (dateRange === 'month') {
        startDate.setDate(now.getDate() - 30);
      }

      filtered = filtered.filter(r => new Date(r.started_at) >= startDate);
    }

    // Direction filter
    if (directionFilter !== 'all') {
      filtered = filtered.filter(r => r.direction === directionFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    return filtered;
  };

  const filteredRecordings = getFilteredRecordings();
  
  // Calculate stats from real data
  const stats = {
    total: recordings.length,
    inbound: recordings.filter(r => r.direction === 'inbound').length,
    outbound: recordings.filter(r => r.direction === 'outbound').length,
    completed: recordings.filter(r => r.status === 'completed').length,
    failed: recordings.filter(r => r.status === 'failed').length,
    totalDuration: recordings.reduce((sum, r) => sum + (r.duration || 0), 0),
    avgDuration: recordings.length > 0 ? Math.round(recordings.reduce((sum, r) => sum + (r.duration || 0), 0) / recordings.length) : 0,
    avgDurationMin: recordings.length > 0 ? Math.round(recordings.reduce((sum, r) => sum + (r.duration || 0), 0) / recordings.length / 60) : 0,
  };

  return (
    <PageLayout title="Reports & Analytics" description="Call recordings and analytics for your organization">
      <div className="space-y-6">
        {!activeOrgId && (!orgs || orgs.length === 0) ? (
          <div className="bg-slate-900/80 rounded-xl p-8 ring-1 ring-slate-800 text-center">
            <p className="text-slate-300">No organization available. Please contact your administrator.</p>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Calls */}
              <div className="bg-gradient-to-br from-blue-900/40 to-blue-900/20 rounded-xl p-6 ring-1 ring-blue-800/50">
                <div className="text-sm font-semibold text-blue-300 mb-2">Total Calls</div>
                <div className="text-3xl font-bold text-white">{stats.total}</div>
                <p className="text-xs text-blue-400 mt-2">{stats.inbound} inbound, {stats.outbound} outbound</p>
              </div>

              {/* Call Status */}
              <div className="bg-gradient-to-br from-emerald-900/40 to-emerald-900/20 rounded-xl p-6 ring-1 ring-emerald-800/50">
                <div className="text-sm font-semibold text-emerald-300 mb-2">Call Status</div>
                <div className="text-3xl font-bold text-white">{stats.completed}/{stats.total}</div>
                <p className="text-xs text-emerald-400 mt-2">{stats.failed} failed calls</p>
              </div>

              {/* Total Duration */}
              <div className="bg-gradient-to-br from-purple-900/40 to-purple-900/20 rounded-xl p-6 ring-1 ring-purple-800/50">
                <div className="text-sm font-semibold text-purple-300 mb-2">Total Duration</div>
                <div className="text-3xl font-bold text-white">{Math.round(stats.totalDuration / 60)}m</div>
                <p className="text-xs text-purple-400 mt-2">Across all calls</p>
              </div>

              {/* Average Duration */}
              <div className="bg-gradient-to-br from-cyan-900/40 to-cyan-900/20 rounded-xl p-6 ring-1 ring-cyan-800/50">
                <div className="text-sm font-semibold text-cyan-300 mb-2">Average Duration</div>
                <div className="text-3xl font-bold text-white">{stats.avgDurationMin}m</div>
                <p className="text-xs text-cyan-400 mt-2">{stats.avgDuration}s per call</p>
              </div>
            </div>

            {/* Sync & Filters */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Sync & Filter</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wider">Date Range</label>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
                  >
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="all">All Time</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wider">Direction</label>
                  <select
                    value={directionFilter}
                    onChange={(e) => setDirectionFilter(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
                  >
                    <option value="all">All Directions</option>
                    <option value="inbound">Inbound Only</option>
                    <option value="outbound">Outbound Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wider">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
                  >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold py-2.5 rounded-lg transition duration-200 text-sm"
                  >
                    {syncing ? 'Syncing...' : 'Sync Reports'}
                  </button>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={fetchRecordings}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold py-2.5 rounded-lg transition duration-200 text-sm"
                  >
                    {loading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
              </div>

              {message && (
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-sm text-slate-300">{message}</p>
                </div>
              )}
            </div>

            {/* Reports Table */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Call Reports</h2>
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800/60 text-slate-300 ring-1 ring-slate-700">
                  {loading ? '...' : filteredRecordings.length} calls
                </span>
              </div>

              {loading ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">Loading reports...</p>
                </div>
              ) : filteredRecordings.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">No call reports found matching your filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Direction</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">From (Caller)</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">To (Number)</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300">Duration</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Date & Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecordings.slice(0, 100).map((rec) => (
                        <tr key={rec.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition">
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-md text-xs font-medium inline-block ${
                              rec.direction === 'inbound' ? 'bg-blue-900/40 text-blue-300' : 'bg-emerald-900/40 text-emerald-300'
                            }`}>
                              {rec.direction === 'inbound' ? '↓ Inbound' : '↑ Outbound'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs font-bold">{rec.from_number || '—'}</td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs font-bold">{rec.to_number || rec.phone_number_id || '—'}</td>
                          <td className="px-4 py-3 text-center text-slate-300">
                            {rec.duration ? `${Math.floor(rec.duration / 60)}m ${rec.duration % 60}s` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-md text-xs font-medium inline-block ${
                              rec.status === 'completed' ? 'bg-emerald-900/40 text-emerald-300' :
                              rec.status === 'failed' ? 'bg-red-900/40 text-red-300' :
                              'bg-slate-900/40 text-slate-300'
                            }`}>
                              {rec.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                            {new Date(rec.started_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}

export default ReportsPage;
