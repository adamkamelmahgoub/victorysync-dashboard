import React, { FC, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { triggerMightyCallPhoneNumberSync } from '../lib/apiClient';
import { getOrgPhoneNumbers } from '../lib/phonesApi';
import { PageLayout } from '../components/PageLayout';

const NumbersPage: FC = () => {
  const { user, selectedOrgId } = useAuth();
  const userId = user?.id;
  const [numbers, setNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      setMessage('Failed to load phone numbers');
    } finally {
      setLoading(false);
    }
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
                          <h4 className="text-lg font-bold text-white">{num.phone_number}</h4>
                          <p className="text-xs text-slate-500 mt-1">
                            {num.provider || 'Standard Provider'}
                          </p>
                        </div>
                        <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${
                          num.status === 'active' ? 'bg-emerald-900/40 text-emerald-300' :
                          num.status === 'pending' ? 'bg-amber-900/40 text-amber-300' :
                          'bg-red-900/40 text-red-300'
                        }`}>
                          {num.status || 'unknown'}
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
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export { NumbersPage };
