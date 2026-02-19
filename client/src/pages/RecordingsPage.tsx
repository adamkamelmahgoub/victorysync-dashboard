import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';
import { PageLayout } from '../components/PageLayout';

interface Recording {
  id: string;
  org_id: string;
  call_id?: string;
  from_number?: string | null;
  to_number?: string | null;
  duration_seconds?: number | null;
  duration?: number | null;
  recording_date?: string | null;
  recording_url?: string | null;
  created_at?: string | null;
}

export function RecordingsPage() {
  const { user } = useAuth();
  const { org: currentOrg } = useOrg();
  const orgId = currentOrg?.id;

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecordings = async () => {
    if (!orgId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildApiUrl(`/api/orgs/${orgId}/recordings`), {
        headers: {
          'x-user-id': user.id,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        setError('Failed to fetch recordings');
        return;
      }

      const data = await response.json();
      setRecordings(Array.isArray(data) ? data : data.recordings || []);
    } catch (err: any) {
      setError(err?.message || 'Error fetching recordings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId && user) {
      fetchRecordings();
    }
  }, [orgId, user?.id]);

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

  const handleDownload = async (recording: Recording) => {
    try {
      const response = await fetch(buildApiUrl(`/api/recordings/${recording.id}/download`), {
        headers: {
          'x-user-id': user?.id || '',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        setError('Failed to download recording');
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${recording.id}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: any) {
      setError(err?.message || 'Error downloading recording');
    }
  };

  if (!orgId) {
    return (
      <PageLayout title="Recordings" description="No organization selected">
        <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-6 text-slate-300">Please select an organization to view recordings.</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Recordings" description={`View recordings for ${currentOrg?.name || 'your organization'}`}>
      <div className="space-y-6">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={fetchRecordings}
            disabled={loading}
            className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition font-medium"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-700/50">
                  <tr className="text-slate-400">
                    <th className="text-left py-3 px-4 font-semibold">From / To</th>
                    <th className="text-left py-3 px-4 font-semibold">Duration</th>
                    <th className="text-left py-3 px-4 font-semibold">Date</th>
                    <th className="text-left py-3 px-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {recordings.map((recording) => (
                    <tr key={recording.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 text-slate-300 font-mono text-xs">{(recording.from_number || '-') + ' -> ' + (recording.to_number || '-')}</td>
                      <td className="py-3 px-4 text-slate-300">{formatDuration(durationSeconds(recording))}</td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{formatDate(recording)}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-3">
                          {recording.recording_url && (
                            <a href={recording.recording_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-xs font-semibold">
                              Play
                            </a>
                          )}
                          <button onClick={() => handleDownload(recording)} className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold">
                            Download
                          </button>
                        </div>
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
}

export default RecordingsPage;
