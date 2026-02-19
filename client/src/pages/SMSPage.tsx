import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';
import { PageLayout } from '../components/PageLayout';

interface SMSMessage {
  id: string;
  org_id: string;
  from_number?: string | null;
  to_number?: string | null;
  message_text?: string | null;
  direction?: 'inbound' | 'outbound' | string;
  status?: string | null;
  created_at?: string | null;
  message_date?: string | null;
  sent_at?: string | null;
}

const PAGE_SIZE = 500;

export function SMSPage() {
  const { user } = useAuth();
  const { org: currentOrg } = useOrg();
  const orgId = currentOrg?.id;

  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [recipientNumber, setRecipientNumber] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(0);

  const loadMessages = async (reset = false) => {
    if (!orgId || !user) return;
    if (!reset && nextOffset == null) return;

    const activeOffset = reset ? 0 : (nextOffset ?? 0);

    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const url = buildApiUrl(`/api/sms/messages?org_id=${encodeURIComponent(orgId)}&limit=${PAGE_SIZE}&offset=${activeOffset}`);
      const response = await fetch(url, {
        headers: {
          'x-user-id': user.id,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        setError('Failed to fetch SMS messages');
        return;
      }

      const data = await response.json();
      const rows: SMSMessage[] = data.messages || [];
      setMessages((prev) => (reset ? rows : [...prev, ...rows]));
      setNextOffset(data.next_offset ?? null);
    } catch (err: any) {
      setError(err?.message || 'Error fetching messages');
      console.error('Error fetching messages:', err);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (orgId && user) {
      loadMessages(true);
    }
  }, [orgId, user?.id]);

  const handleSendSMS = async () => {
    if (!orgId || !user || !newMessage || !recipientNumber) {
      setError('Please fill in all fields');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl(`/api/orgs/${orgId}/sms/send`), {
        method: 'POST',
        headers: {
          'x-user-id': user.id,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to: recipientNumber, message: newMessage })
      });

      if (response.ok) {
        setNewMessage('');
        setRecipientNumber('');
        setShowSendModal(false);
        await loadMessages(true);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || 'Failed to send SMS');
      }
    } catch (err: any) {
      setError(err?.message || 'Error sending SMS');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (m: SMSMessage) => {
    const raw = m.created_at || m.message_date || m.sent_at;
    return raw ? new Date(raw).toLocaleString() : '-';
  };

  if (!orgId) {
    return (
      <PageLayout title="SMS" description="No organization selected">
        <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-6 text-slate-300">Please select an organization to view SMS messages.</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="SMS Messages" description={`Manage SMS communication for ${currentOrg?.name || 'your organization'}`}>
      <div className="space-y-6">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={() => setShowSendModal(true)}
            className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition font-medium"
          >
            Send SMS
          </button>
        </div>

        <div className="bg-slate-900/80 ring-1 ring-slate-800 p-6 rounded-lg">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Messages ({messages.length})</h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 mb-2"></div>
              <div className="text-slate-400 text-sm">Loading messages...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">No SMS messages found</div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700/50">
                    <tr className="text-slate-400">
                      <th className="text-left py-3 px-4 font-semibold">From / To</th>
                      <th className="text-left py-3 px-4 font-semibold">Message</th>
                      <th className="text-left py-3 px-4 font-semibold">Direction</th>
                      <th className="text-left py-3 px-4 font-semibold">Status</th>
                      <th className="text-left py-3 px-4 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {messages.map((msg) => (
                      <tr key={msg.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 text-slate-300 font-mono text-xs">{(msg.from_number || '-') + ' -> ' + (msg.to_number || '-')}</td>
                        <td className="py-3 px-4 text-slate-300 text-xs break-words">{msg.message_text || '-'}</td>
                        <td className="py-3 px-4 text-slate-300 text-xs">{msg.direction || '-'}</td>
                        <td className="py-3 px-4 text-slate-400 text-xs">{msg.status || '-'}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{formatTime(msg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nextOffset !== null && (
                <div className="flex justify-center">
                  <button
                    onClick={() => loadMessages(false)}
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

      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4 border border-slate-800">
            <h2 className="text-xl font-bold text-white mb-4">Send SMS</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Recipient Number</label>
                <input
                  type="tel"
                  value={recipientNumber}
                  onChange={(e) => setRecipientNumber(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Message</label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 resize-none"
                  rows={4}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSendModal(false)}
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendSMS}
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default SMSPage;
