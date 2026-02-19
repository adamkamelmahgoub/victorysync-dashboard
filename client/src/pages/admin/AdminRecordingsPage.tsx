import React, { FC, useEffect, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';

interface Recording {
  id: string;
  org_id: string;
  from_number?: string | null;
  to_number?: string | null;
  duration_seconds?: number | null;
  duration?: number | null;
  recording_date?: string | null;
  created_at?: string | null;
  recording_url?: string | null;
  organizations?: { name: string; id: string };
}

interface Org {
  id: string;
  name: string;
}

const PAGE_SIZE = 500;

const AdminRecordingsPage: FC = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterOrgId, setFilterOrgId] = useState('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [nextOffset, setNextOffset] = useState<number | null>(0);

  useEffect(() => {
    fetchOrgs();
  }, []);

  useEffect(() => {
    loadRecordings(true);
  }, [filterOrgId, userId]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const interval = setInterval(() => {
      loadRecordings(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefreshEnabled, filterOrgId, userId]);

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

  const loadRecordings = async (reset = false) => {
    const activeOffset = reset ? 0 : (nextOffset ?? 0);
    if (!userId) return;
    if (!reset && nextOffset == null) return;

    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      let url = buildApiUrl(`/api/mightycall/recordings?limit=${PAGE_SIZE}&offset=${activeOffset}`);
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
        console.error('Failed to fetch recordings');
        return;
      }

      const data = await response.json();
      const rows: Recording[] = data.recordings || [];
      setRecordings((prev) => (reset ? rows : [...prev, ...rows]));
      setNextOffset(data.next_offset ?? null);
    } catch (error) {
      console.error('Error fetching recordings:', error);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  const durationSeconds = (r: Recording) => Number(r.duration_seconds ?? r.duration ?? 0) || 0;

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (r: Recording) => {
    const raw = r.recording_date || r.created_at;
    return raw ? new Date(raw).toLocaleString() : '-';
  };

  return (
    <PageLayout title="Recordings" description="View and manage call recordings across organizations">
      <div className="space-y-6">
        <AdminTopNav />

        <div className="bg-slate-900/80 ring-1 ring-slate-800 p-6 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Filters</h2>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 text-cyan-500"
              />
              Auto-refresh (5s)
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        </div>

        <div className="bg-slate-900/80 ring-1 ring-slate-800 p-6 rounded-lg">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Recordings ({recordings.length})</h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 mb-2"></div>
              <div className="text-slate-400 text-sm">Loading recordings...</div>
            </div>
          ) : recordings.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">No recordings found</div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700/50">
                    <tr className="text-slate-400">
                      <th className="text-left py-3 px-4 font-semibold">Organization</th>
                      <th className="text-left py-3 px-4 font-semibold">From / To</th>
                      <th className="text-left py-3 px-4 font-semibold">Duration</th>
                      <th className="text-left py-3 px-4 font-semibold">Recording Date</th>
                      <th className="text-left py-3 px-4 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {recordings.map((recording) => (
                      <tr key={recording.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 text-slate-200">{recording.organizations?.name || recording.org_id}</td>
                        <td className="py-3 px-4 text-slate-300 font-mono text-xs">
                          {(recording.from_number || '-') + ' -> ' + (recording.to_number || '-')}
                        </td>
                        <td className="py-3 px-4 text-slate-400">{formatDuration(durationSeconds(recording))}</td>
                        <td className="py-3 px-4 text-slate-400 text-xs">{formatDate(recording)}</td>
                        <td className="py-3 px-4">
                          {recording.recording_url && (
                            <a href={recording.recording_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-xs font-semibold transition">
                              Play
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nextOffset !== null && (
                <div className="flex justify-center">
                  <button
                    onClick={() => loadRecordings(false)}
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
    </PageLayout>
  );
};

export default AdminRecordingsPage;
