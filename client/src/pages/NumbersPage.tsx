import React, { FC, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { triggerMightyCallPhoneNumberSync } from '../lib/apiClient';
import { getOrgPhoneNumbers } from '../lib/phonesApi';
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
}

const NumbersPage: FC = () => {
  const { user, selectedOrgId } = useAuth();
  const userId = user?.id;
  const [numbers, setNumbers] = useState<any[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [requestType, setRequestType] = useState('add');
  const [requestDetails, setRequestDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchNumbers();
  }, [selectedOrgId, userId]);

  const fetchNumbers = async () => {
    if (!selectedOrgId || !userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getOrgPhoneNumbers(selectedOrgId, userId);
      setNumbers(data || []);
      // Fetch recordings for these numbers
      await fetchRecordings();
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      setMessage('Failed to load phone numbers');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecordings = async () => {
    if (!selectedOrgId || !userId) return;
    
    try {
      setRecordingsLoading(true);
      const response = await fetch(`/api/orgs/${selectedOrgId}/recordings`, {
        headers: { 'x-user-id': userId }
      });
      if (response.ok) {
        const data = await response.json();
        setRecordings(data.recordings || []);
      }
    } catch (error) {
      console.error('Error fetching recordings:', error);
    } finally {
      setRecordingsLoading(false);
    }
  };

  const loadDemoData = () => {
    if (!numbers || numbers.length === 0) return;
    const demo: Recording[] = numbers.map((n: any, i: number) => ({
      id: `demo-${i}-${Date.now()}`,
      phone_number: n.number || n.phone_number,
      direction: i % 2 === 0 ? 'inbound' : 'outbound',
      duration: 30 + i * 10,
      status: 'completed',
      started_at: new Date(Date.now() - (i + 1) * 60 * 60 * 1000).toISOString(),
      from_number: i % 2 === 0 ? '+15551234567' : '+15559876543',
      to_number: n.number || n.phone_number,
    }));
    setRecordings(demo);
  };

  const handleSync = async () => {
    if (!userId) return;
    setSyncing(true);
    setMessage('Syncing phone numbers...');
    try {
      const result: any = await triggerMightyCallPhoneNumberSync(userId);
      setMessage(`Synced ${result.records_processed || 0} phone numbers`);
      setTimeout(() => fetchNumbers(), 1000);
    } catch (err: any) {
      setMessage(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleRequestPhoneNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestDetails.trim()) {
      alert('Please enter request details');
      return;
    }

    try {
      setSubmitting(true);
      
      const response = await fetch('http://localhost:4000/api/support/tickets', {
        method: 'POST',
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject: `Phone Number Request: ${requestType}`,
          message: `Request Type: ${requestType}\n\nDetails:\n${requestDetails}`,
          priority: 'normal'
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        alert(`Error: ${errData.error || 'Failed to submit request'}`);
        return;
      }

      alert('Phone number request submitted successfully');
      setRequestType('add');
      setRequestDetails('');
    } catch (error) {
      console.error('Error submitting request:', error);
      alert('Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout title="Phone Numbers" description="Manage and sync your phone numbers">
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar: Sync & Request */}
          <div className="lg:col-span-1 space-y-4">
            {/* Sync Card */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <h3 className="text-lg font-semibold text-white mb-4">Sync Numbers</h3>
              <button 
                onClick={handleSync} 
                disabled={syncing} 
                className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold py-3 rounded-lg transition duration-200 mb-4"
              >
                {syncing ? 'Syncing...' : 'Sync Phone Numbers'}
              </button>
              {message && (
                <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-sm text-slate-300">{message}</p>
                </div>
              )}
            </div>

            {/* Request Change Card */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <h3 className="text-lg font-semibold text-white mb-4">Request Change</h3>
              <form onSubmit={handleRequestPhoneNumber} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2.5">Request Type</label>
                  <select
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
                  >
                    <option value="add">Add Phone Number</option>
                    <option value="remove">Remove Phone Number</option>
                    <option value="replace">Replace Phone Number</option>
                    <option value="routing">Routing Change</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2.5">Details</label>
                  <textarea
                    value={requestDetails}
                    onChange={(e) => setRequestDetails(e.target.value)}
                    placeholder="Describe your request..."
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition resize-none"
                    rows={6}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold py-3 rounded-lg transition duration-200"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </form>
            </div>
          </div>

          {/* Main Content: Phone Numbers Grid */}
          <div className="lg:col-span-2">
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Your Phone Numbers</h2>
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800/60 text-slate-300 ring-1 ring-slate-700">
                  {loading ? '...' : numbers.length} numbers
                </span>
              </div>
              
              {loading ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">Loading phone numbers...</p>
                </div>
              ) : numbers.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">No phone numbers assigned yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {numbers.map((num) => (
                    <div key={num.id} className="bg-gradient-to-br from-slate-800/50 to-slate-900 rounded-lg p-5 ring-1 ring-slate-700 hover:ring-slate-600 transition">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h4 className="text-lg font-bold text-white">{num.number || num.phone_number}</h4>
                          <p className="text-xs text-slate-500 mt-1">
                            {num.label || num.provider || 'Standard Provider'}
                          </p>
                        </div>
                        <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${
                          num.is_active ? 'bg-emerald-900/40 text-emerald-300' :
                          'bg-red-900/40 text-red-300'
                        }`}>
                          {num.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      
                      {num.created_at && (
                        <div className="pt-3 border-t border-slate-700">
                          <p className="text-xs text-slate-500">
                            Added: {new Date(num.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Call Recordings for these numbers */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Recent Calls</h2>
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800/60 text-slate-300 ring-1 ring-slate-700">
                  {recordingsLoading ? '...' : recordings.length} calls
                </span>
              </div>

              {recordingsLoading ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">Loading call data...</p>
                </div>
              ) : recordings.length === 0 ? (
                <div className="p-8 text-center space-y-4">
                  <p className="text-slate-400">No call recordings yet</p>
                  <div>
                    <button
                      onClick={loadDemoData}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
                    >
                      Load demo recordings
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Direction</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">From</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">To</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300">Duration</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordings.slice(0, 20).map((rec) => (
                        <tr key={rec.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition">
                          <td className="px-4 py-3 text-white font-medium font-mono text-xs">{rec.phone_number}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                              rec.direction === 'inbound' ? 'bg-blue-900/40 text-blue-300' : 'bg-emerald-900/40 text-emerald-300'
                            }`}>
                              {rec.direction === 'inbound' ? '↓ Inbound' : '↑ Outbound'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs">{rec.from_number || '—'}</td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs">{rec.to_number || '—'}</td>
                          <td className="px-4 py-3 text-center text-slate-300">
                            {rec.duration ? `${Math.floor(rec.duration / 60)}m ${rec.duration % 60}s` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-md text-xs font-medium ${
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
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default NumbersPage;
export { NumbersPage };
