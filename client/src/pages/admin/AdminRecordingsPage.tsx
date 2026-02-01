import React, { FC, useState, useEffect } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';

interface Recording {
  id: string;
  org_id: string;
  phone_number: string;
  duration: number;
  recording_date: string;
  created_at: string;
  organizations?: { name: string; id: string };
  recording_url?: string;
  [key: string]: any;
}

interface Org {
  id: string;
  name: string;
}

const AdminRecordingsPage: FC = () => {
  const { user } = useAuth();
  const userId = user?.id;
  
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterOrgId, setFilterOrgId] = useState('');

  useEffect(() => {
    fetchOrgs();
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [filterOrgId]);

  const fetchOrgs = async () => {
    try {
      const response = await fetch('http://localhost:4000/api/admin/orgs', {
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

  const fetchRecordings = async () => {
    try {
      setLoading(true);
      
      let url = `http://localhost:4000/api/mightycall/recordings?limit=200`;
      if (filterOrgId) {
        url += `&org_id=${filterOrgId}`;
      }

      const response = await fetch(url, {
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch recordings');
        return;
      }

      const data = await response.json();
      setRecordings(data.recordings || []);
    } catch (error) {
      console.error('Error fetching recordings:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <PageLayout title="Recordings" description="View and manage call recordings across organizations">
      <div className="space-y-6">

        <AdminTopNav />

        {/* Filters Card */}
        <div className="bg-slate-900/80 ring-1 ring-slate-800 p-6 rounded-lg">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Organization</label>
              <select
                value={filterOrgId}
                onChange={(e) => setFilterOrgId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
              >
                <option value="">All Organizations</option>
                {orgs.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Recordings List */}
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-700/50">
                  <tr className="text-slate-400">
                    <th className="text-left py-3 px-4 font-semibold">Organization</th>
                    <th className="text-left py-3 px-4 font-semibold">Phone Number</th>
                    <th className="text-left py-3 px-4 font-semibold">Duration</th>
                    <th className="text-left py-3 px-4 font-semibold">Recording Date</th>
                    <th className="text-left py-3 px-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {recordings.slice(0, 100).map((recording) => (
                    <tr key={recording.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 text-slate-200">{recording.organizations?.name || recording.org_id}</td>
                      <td className="py-3 px-4 text-slate-300">{recording.phone_number}</td>
                      <td className="py-3 px-4 text-slate-400">{formatDuration(recording.duration)}</td>
                      <td className="py-3 px-4 text-slate-400 text-xs">{new Date(recording.recording_date || recording.created_at).toLocaleString()}</td>
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
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default AdminRecordingsPage;
