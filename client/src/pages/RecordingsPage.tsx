import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { triggerMightyCallRecordingsSync } from '../lib/apiClient';
import { PageLayout } from '../components/PageLayout';

export function RecordingsPage() {
  const { user, selectedOrgId } = useAuth();
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [playingUrls, setPlayingUrls] = useState<Record<string, string>>({});
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedOrgId) fetchRecordings();
  }, [selectedOrgId]);

  const fetchRecordings = async () => {
    if (!selectedOrgId || !user) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`http://localhost:4000/api/recordings?limit=50&org_id=${selectedOrgId}`, {
        headers: { 'x-user-id': user.id }
      });
      if (response.ok) {
        const data = await response.json();
        setRecordings(data.recordings || []);
      } else {
        setMessage('Failed to fetch recordings');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Error fetching recordings');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecordingBlob = async (id: string) => {
    if (!user) throw new Error('not_authenticated');
    const resp = await fetch(`http://localhost:4000/api/recordings/${id}/download`, {
      headers: { 'x-user-id': user.id }
    });
    if (!resp.ok) throw new Error('failed_to_fetch_recording');
    return await resp.blob();
  };

  const handlePlay = async (r: any) => {
    try {
      const blob = await fetchRecordingBlob(r.id);
      const url = URL.createObjectURL(blob);
      setPlayingUrls(prev => ({ ...prev, [r.id]: url }));
      setTimeout(() => {
        const el = document.getElementById(`audio-${r.id}`) as HTMLAudioElement | null;
        el?.play();
      }, 150);
    } catch (e: any) {
      setMessage('Failed to load recording');
    }
  };

  const handleDownload = async (r: any) => {
    try {
      const blob = await fetchRecordingBlob(r.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${r.id}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e: any) {
      setMessage('Download failed');
    }
  };

  const handleSync = async () => {
    if (!selectedOrgId || !user) return setMessage('No org selected');
    setSyncing(true);
    setMessage('Syncing...');
    try {
      const result: any = await triggerMightyCallRecordingsSync(selectedOrgId, startDate, endDate, user.id);
      setMessage(`Synced ${result.recordings_synced || 0} recordings`);
      setTimeout(() => fetchRecordings(), 1000);
    } catch (err: any) {
      setMessage(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <PageLayout title="Recordings" description="Call recordings and audio files">
      <div className="space-y-6">
        {!selectedOrgId ? (
          <div className="bg-slate-900/80 rounded-xl p-8 ring-1 ring-slate-800 text-center">
            <p className="text-slate-300">No organization selected</p>
            <p className="text-sm text-slate-500 mt-2">Select an organization from the admin panel to view recordings.</p>
          </div>
        ) : (
          <>
            {/* Filters Card */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <h3 className="text-sm font-semibold text-white mb-4">Filter Recordings</h3>
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
                    {syncing ? 'Syncing...' : 'Sync Recordings'}
                  </button>
                </div>
              </div>
              {message && (
                <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-sm text-slate-300">{message}</p>
                </div>
              )}
            </div>

            {/* Recordings Grid */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Recordings</h2>
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800/60 text-slate-300 ring-1 ring-slate-700">
                  {recordings.length} total
                </span>
              </div>
              {loading ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">Loading recordings...</p>
                </div>
              ) : recordings.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">No recordings found. Try syncing data.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recordings.slice(0, 50).map((r: any) => (
                    <div key={r.id} className="bg-gradient-to-br from-slate-800/50 to-slate-900 rounded-lg p-5 ring-1 ring-slate-700 hover:ring-slate-600 transition">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-white text-sm">
                            {r.from_number && r.to_number ? `${r.from_number} → ${r.to_number}` : 'Recording'}
                          </h4>
                          <p className="text-xs text-slate-400 mt-1">{r.recording_date ? new Date(r.recording_date).toLocaleDateString() : 'No date'}</p>
                          {r.org_name && (
                            <p className="text-xs text-cyan-400 mt-1">Org: <span className="font-medium">{r.org_name}</span></p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="inline-block px-2 py-1 rounded-md text-xs font-medium bg-emerald-900/40 text-emerald-300 whitespace-nowrap">Ready</div>
                          <div className="flex gap-2">
                            <button onClick={() => handlePlay(r)} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white transition">Play</button>
                            <button onClick={() => handleDownload(r)} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white transition">Download</button>
                          </div>
                        </div>
                      </div>
                      {r.duration_seconds && (
                        <div className="pt-3 border-t border-slate-700">
                          <p className="text-xs text-slate-500">Duration: {Math.floor(r.duration_seconds / 60)}m {r.duration_seconds % 60}s</p>
                        </div>
                      )}

                      {playingUrls[r.id] && (
                        <div className="pt-3">
                          <audio id={`audio-${r.id}`} controls src={playingUrls[r.id]} className="w-full mt-2" />
                        </div>
                      )}
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

export default RecordingsPage;
