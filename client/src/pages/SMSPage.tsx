import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import { buildApiUrl } from '../config';

export function SMSPage() {
  const { user, selectedOrgId } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateRange, setDateRange] = useState('month'); // 'week', 'month', 'all'

  useEffect(() => {
    if (selectedOrgId) fetchMessages();
  }, [selectedOrgId]);

  const fetchMessages = async () => {
    if (!selectedOrgId || !user) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(buildApiUrl(`/api/sms/messages?limit=100&org_id=${selectedOrgId}`), {
        headers: { 'x-user-id': user.id }
      });
      if (response.ok) {
        const data = await response.json();
        let filtered = data.messages || [];
        
        // Apply date filtering
        if (dateRange !== 'all') {
          const start = new Date(startDate);
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          
          filtered = filtered.filter((m: any) => {
            const msgDate = new Date(m.created_at || m.sent_at || m.timestamp);
            return msgDate >= start && msgDate <= end;
          });
        }
        
        setMessages(filtered);
      } else {
        setMessage('Failed to fetch SMS messages');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Error fetching messages');
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (range: string) => {
    setDateRange(range);
    const now = new Date();
    const start = new Date();
    
    if (range === 'week') {
      start.setDate(now.getDate() - 7);
    } else if (range === 'month') {
      start.setDate(now.getDate() - 30);
    } else if (range === 'all') {
      start.setFullYear(2020); // Far back
    }
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(now.toISOString().split('T')[0]);
  };

  return (
    <PageLayout title="SMS Messages" description="Inbound and outbound SMS communication">
      <div className="space-y-6">
        {!selectedOrgId ? (
          <div className="bg-slate-900/80 rounded-xl p-8 ring-1 ring-slate-800 text-center">
            <p className="text-slate-300">No organization selected</p>
            <p className="text-sm text-slate-500 mt-2">Select an organization from the admin panel to view SMS messages.</p>
          </div>
        ) : (
          <>
            {/* Filters Card */}
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <h3 className="text-sm font-semibold text-white mb-4">Filter Messages</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Quick Range</label>
                  <select 
                    value={dateRange}
                    onChange={(e) => handleDateRangeChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
                  >
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="all">All Time</option>
                  </select>
                </div>
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
                    onClick={fetchMessages}
                    disabled={loading}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg font-semibold text-sm transition duration-200"
                  >
                    {loading ? 'Loading...' : 'Apply Filter'}
                  </button>
                </div>
              </div>
              {message && (
                <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <p className="text-sm text-slate-300">{message}</p>
                </div>
              )}
            </div>

            {/* Messages Count Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/50 rounded-lg p-6 ring-1 ring-slate-800">
                <p className="text-slate-400 text-sm">Total Messages</p>
                <p className="text-3xl font-bold text-white mt-2">{messages.length}</p>
              </div>
            </div>

            {/* Messages Container */}
            <div className="bg-slate-900/80 rounded-xl ring-1 ring-slate-800 overflow-hidden">
              <div className="p-6 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white">Message History</h2>
              </div>
              
              {loading ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">Loading messages...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">No SMS messages found.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {messages.slice(0, 50).map((m: any) => (
                    <div key={m.id} className="p-5 hover:bg-slate-800/30 transition">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-200 text-sm mb-2">
                            <span className="text-cyan-400">{m.from_number}</span>
                            <span className="text-slate-500 mx-2">→</span>
                            <span className="text-emerald-400">{m.to_number}</span>
                          </div>
                          <p className="text-slate-400 text-sm break-words">{m.message_text || m.content}</p>
                        </div>
                        <div className="text-right whitespace-nowrap ml-4">
                          <p className="text-xs text-slate-500">
                            {new Date(m.created_at || m.timestamp).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-slate-600 mt-1">
                            {new Date(m.created_at || m.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
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

export default SMSPage;
