import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { triggerMightyCallReportsSync } from '../lib/apiClient';
import { PageLayout } from '../components/PageLayout';

export function ReportsPage() {
  const { user, selectedOrgId } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedOrgId) fetchReports();
  }, [selectedOrgId]);

  const fetchReports = async () => {
    if (!selectedOrgId || !user) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`http://localhost:4000/api/mightycall/reports?type=calls&limit=100&org_id=${selectedOrgId}`, {
        headers: { 'x-user-id': user.id }
      });
      if (response.ok) {
        const data = await response.json();
        setReports(data.reports || []);
      } else {
        setMessage('Failed to fetch reports');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Error fetching reports');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!selectedOrgId || !user) return setMessage('No org selected');
    setSyncing(true);
      setMessage('Syncing reports from MightyCall...');
    try {
      const result: any = await triggerMightyCallReportsSync(selectedOrgId, startDate, endDate, user.id);
        if (result.error) {
          setMessage(`Sync error: ${result.error}`);
        } else {
      setMessage(`Synced ${result.reports_synced || 0} reports`);
        }
      setTimeout(() => fetchReports(), 1000);
    } catch (err: any) {
      setMessage(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <PageLayout title="Reports" description="MightyCall reports and analytics">
      <div className="space-y-6">
        {!selectedOrgId ? (
          <div className="bg-slate-900/80 rounded-xl p-8 ring-1 ring-slate-800 text-center">
            <p className="text-slate-300">No organization selected</p>
            <p className="text-sm text-slate-500 mt-2">Select an organization from the admin panel to view reports.</p>
          </div>
        ) : (
          <>
            {/* Filters Card */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
                <h3 className="text-sm font-semibold text-white mb-4">Sync Reports from MightyCall</h3>
                <p className="text-xs text-slate-400 mb-4">Select a date range and click "Sync Reports" to fetch the latest call data from MightyCall. Reports will be aggregated by phone number and date.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div className="flex items-end">
                  <button 
                    onClick={handleSync} 
                    disabled={syncing} 
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg font-semibold text-sm transition duration-200"
                  >
                    {syncing ? 'Syncing...' : 'Sync Reports'}
                  </button>
                </div>
              </div>
              {message && (
                <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-sm text-slate-300">{message}</p>
                </div>
              )}
            </div>

            {/* Reports Grid */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Reports</h2>
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800/60 text-slate-300 ring-1 ring-slate-700">
                  {reports.length} total
                </span>
              </div>
              {loading ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">Loading reports...</p>
                </div>
              ) : reports.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">No reports found. Try syncing data.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reports.slice(0, 50).map((r: any) => (
                    <div key={r.id} className="bg-gradient-to-br from-slate-800/50 to-slate-900 rounded-lg p-5 ring-1 ring-slate-700 hover:ring-slate-600 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-white text-sm">{r.report_type || 'Report'}</h4>
                          <p className="text-xs text-slate-400 mt-2">{r.report_date || r.created_at}</p>
                        </div>
                        <span className="inline-block px-2 py-1 rounded-md text-xs font-medium bg-blue-900/40 text-blue-300 whitespace-nowrap">
                          Report
                        </span>
                      </div>
                    </div>
                  ))}
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
