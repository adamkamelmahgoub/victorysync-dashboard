import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';
import { supabase as supabaseClient } from '../lib/supabaseClient';

interface Recording {
  id: string;
  org_id: string;
  call_id?: string;
  from_number?: string;
  to_number?: string;
  duration: number;
  recording_date: string;
  url?: string;
  created_at: string;
}

export function RecordingsPage() {
  const { user } = useAuth();
  const { org: currentOrg } = useOrg();
  const orgId = currentOrg?.id;

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingIds, setPlayingIds] = useState<Set<string>>(new Set());

  // Fetch recordings
  const fetchRecordings = async () => {
    if (!orgId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        buildApiUrl(`/api/orgs/${orgId}/recordings`),
        {
          headers: {
            'x-user-id': user.id,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRecordings(Array.isArray(data) ? data : data.recordings || []);
      } else {
        setError('Failed to fetch recordings');
      }
    } catch (err: any) {
      setError(err?.message || 'Error fetching recordings');
      console.error('Error fetching recordings:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (orgId && user) {
      fetchRecordings();
    }
  }, [orgId, user]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!orgId) return;

    const channel = supabaseClient
      .channel(`org-recordings-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mightycall_recordings',
          filter: `org_id=eq.${orgId}`
        },
        () => {
          console.log('Recording updated, refreshing...');
          fetchRecordings();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [orgId]);

  const handlePlay = (recordingId: string) => {
    setPlayingIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recordingId)) {
        newSet.delete(recordingId);
      } else {
        newSet.add(recordingId);
      }
      return newSet;
    });
  };

  const handleDownload = async (recording: Recording) => {
    try {
      const response = await fetch(
        buildApiUrl(`/api/recordings/${recording.id}/download`),
        {
          headers: {
            'x-user-id': user?.id || '',
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${recording.id}.mp3`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else {
        setError('Failed to download recording');
      }
    } catch (err: any) {
      setError(err?.message || 'Error downloading recording');
      console.error('Error downloading recording:', err);
    }
  };

  if (!orgId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 text-lg">No organization selected</p>
          <p className="text-slate-500 text-sm mt-2">Please select an organization to view recordings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Recordings</h1>
            <p className="text-slate-400 mt-2">View and download call recordings for {currentOrg?.name}</p>
          </div>
          <button
            onClick={fetchRecordings}
            disabled={loading}
            className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition font-medium"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
            <p className="text-slate-400 text-sm">Total Recordings</p>
            <p className="text-3xl font-bold text-white mt-2">{recordings.length}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
            <p className="text-slate-400 text-sm">Total Duration</p>
            <p className="text-3xl font-bold text-white mt-2">
              {Math.floor(recordings.reduce((sum, r) => sum + (r.duration || 0), 0) / 60)}m
            </p>
          </div>
        </div>

        {/* Recordings Grid */}
        <div className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-xl font-semibold text-white">Recording Library</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <p className="text-slate-400">Loading recordings...</p>
            </div>
          ) : recordings.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-400">No recordings available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
              {recordings.slice(0, 50).map((recording) => (
                <div key={recording.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition">
                  <div className="space-y-3">
                    {/* Header */}
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {recording.from_number && recording.to_number
                          ? `${recording.from_number} → ${recording.to_number}`
                          : 'Recording'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(recording.recording_date || recording.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Duration */}
                    {recording.duration && (
                      <div className="pt-2 border-t border-slate-700">
                        <p className="text-xs text-slate-400">
                          Duration: <span className="text-cyan-400 font-semibold">
                            {Math.floor(recording.duration / 60)}m {recording.duration % 60}s
                          </span>
                        </p>
                      </div>
                    )}

                    {/* Player */}
                    {playingIds.has(recording.id) && recording.url && (
                      <div className="pt-2">
                        <audio
                          src={recording.url}
                          controls
                          className="w-full h-8"
                          autoPlay
                        />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handlePlay(recording.id)}
                        className="flex-1 px-3 py-2 text-xs font-medium bg-slate-700 text-white rounded hover:bg-slate-600 transition"
                      >
                        {playingIds.has(recording.id) ? 'Hide Player' : 'Play'}
                      </button>
                      <button
                        onClick={() => handleDownload(recording)}
                        className="flex-1 px-3 py-2 text-xs font-medium bg-cyan-600 text-white rounded hover:bg-cyan-700 transition"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RecordingsPage;
