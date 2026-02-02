import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { triggerMightyCallReportsSync } from '../lib/apiClient';
import { PageLayout } from '../components/PageLayout';

interface Recording {
  id: string;
  phone_number: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  status: string;
  started_at: string;
  from_number?: string;
  to_number?: string;
  call_type?: string;
}

export function ReportsPage() {
  const { user, selectedOrgId } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dateRange, setDateRange] = useState('week'); // 'today', 'week', 'month', 'all'
  const [directionFilter, setDirectionFilter] = useState('all'); // 'inbound', 'outbound', 'all'
  const [statusFilter, setStatusFilter] = useState('all'); // 'completed', 'failed', 'all'
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedOrgId) fetchRecordings();
  }, [selectedOrgId]);

  const fetchRecordings = async () => {
    if (!selectedOrgId || !user) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orgs/${selectedOrgId}/recordings`, {
        headers: { 'x-user-id': user.id }
      });
      if (response.ok) {
        const data = await response.json();
        setRecordings(data.recordings || []);
        if ((data.recordings || []).length === 0) {
          setMessage('No call recordings found for this organization.');
        }
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
    if (!selectedOrgId || !user) return setMessage('No org selected');
    setSyncing(true);
    setMessage('Syncing recordings from MightyCall...');
    try {
      const result: any = await triggerMightyCallReportsSync(selectedOrgId, undefined, undefined, user.id);
      if (result.error) {
        setMessage(`Sync error: ${result.error}`);
      } else {
        setMessage(`Synced ${result.reports_synced || 0} recordings`);
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
  
  // Calculate stats
  const stats = {
    total: recordings.length,
    inbound: recordings.filter(r => r.direction === 'inbound').length,
    outbound: recordings.filter(r => r.direction === 'outbound').length,
    totalDuration: recordings.reduce((sum, r) => sum + (r.duration || 0), 0),
    avgDuration: recordings.length > 0 ? Math.round(recordings.reduce((sum, r) => sum + (r.duration || 0), 0) / recordings.length) : 0,
  };

  return (
    <PageLayout title="Reports & Analytics" description="Call recordings and analytics for your organization">
      <div className="space-y-6">
        {!selectedOrgId ? (
          <div className="bg-slate-900/80 rounded-xl p-8 ring-1 ring-slate-800 text-center">
            <p className="text-slate-300">No organization selected</p>
            <p className="text-sm text-slate-500 mt-2">Select an organization from the admin panel to view reports.</p>
          </div>
        ) : (
          <>
            {/* Statistics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-slate-900/80 rounded-lg p-4 ring-1 ring-slate-800">
                <p className="text-xs text-slate-400 font-semibold">Total Calls</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">{stats.total}</p>
              </div>
              <div className="bg-slate-900/80 rounded-lg p-4 ring-1 ring-slate-800">
                <p className="text-xs text-slate-400 font-semibold">Inbound</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{stats.inbound}</p>
              </div>
              <div className="bg-slate-900/80 rounded-lg p-4 ring-1 ring-slate-800">
                <p className="text-xs text-slate-400 font-semibold">Outbound</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.outbound}</p>
              </div>
              <div className="bg-slate-900/80 rounded-lg p-4 ring-1 ring-slate-800">
                <p className="text-xs text-slate-400 font-semibold">Total Duration</p>
                <p className="text-xl font-bold text-slate-100 mt-1">{Math.round(stats.totalDuration / 60)}m</p>
              </div>
              <div className="bg-slate-900/80 rounded-lg p-4 ring-1 ring-slate-800">
                <p className="text-xs text-slate-400 font-semibold">Avg Duration</p>
                <p className="text-xl font-bold text-slate-100 mt-1">{Math.round(stats.avgDuration / 60)}m</p>
              </div>
            </div>

            {/* Sync Controls */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <h3 className="text-sm font-semibold text-white mb-3">Sync Data</h3>
              <p className="text-xs text-slate-400 mb-4">Click "Sync Now" to fetch the latest call recordings from MightyCall.</p>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg font-semibold text-sm transition duration-200"
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              {message && (
                <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-sm text-slate-300">{message}</p>
                </div>
              )}
            </div>

            {/* Filters Card */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <h3 className="text-sm font-semibold text-white mb-4">Filters</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Date Range</label>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
                  >
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="all">All Time</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Direction</label>
                  <select
                    value={directionFilter}
                    onChange={(e) => setDirectionFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
                  >
                    <option value="all">All Directions</option>
                    <option value="inbound">Inbound Only</option>
                    <option value="outbound">Outbound Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
                  >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Recordings Table */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Call Recordings</h2>
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800/60 text-slate-300 ring-1 ring-slate-700">
                  {filteredRecordings.length} of {recordings.length}
                </span>
              </div>
              {loading ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">Loading recordings...</p>
                </div>
              ) : filteredRecordings.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">{recordings.length === 0 ? 'No recordings found. Try syncing data.' : 'No recordings match the selected filters.'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Phone Number</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Direction</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">From</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">To</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300">Duration</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Date & Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecordings.slice(0, 100).map((r: Recording) => (
                        <tr key={r.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition">
                          <td className="px-4 py-3 text-white font-medium font-mono text-xs">{r.phone_number || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                              r.direction === 'inbound' ? 'bg-blue-900/40 text-blue-300' : 'bg-emerald-900/40 text-emerald-300'
                            }`}>
                              {r.direction === 'inbound' ? '↓ Inbound' : '↑ Outbound'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs">{r.from_number || '—'}</td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs">{r.to_number || '—'}</td>
                          <td className="px-4 py-3 text-center text-slate-300">
                            {r.duration ? `${Math.floor(r.duration / 60)}m ${r.duration % 60}s` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                              r.status === 'completed' ? 'bg-emerald-900/40 text-emerald-300' :
                              r.status === 'failed' ? 'bg-red-900/40 text-red-300' :
                              'bg-slate-900/40 text-slate-300'
                            }`}>
                              {r.status || 'unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                            {r.started_at ? new Date(r.started_at).toLocaleString() : '—'}
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
