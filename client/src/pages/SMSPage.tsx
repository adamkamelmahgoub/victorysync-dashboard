import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import { buildApiUrl } from '../config';

export function SMSPage() {
  const { user, selectedOrgId } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
        setMessages(data.messages || []);
      } else {
        setMessage('Failed to fetch SMS messages');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Error fetching messages');
    } finally {
      setLoading(false);
    }
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
