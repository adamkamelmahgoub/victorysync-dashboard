import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';
import { supabase as supabaseClient } from '../lib/supabaseClient';

interface SMSMessage {
  id: string;
  org_id: string;
  phone_number_id?: string;
  phone_number?: string;
  sender: string;
  recipient: string;
  message: string;
  direction: 'inbound' | 'outbound';
  status: string;
  created_at: string;
}

export function SMSPage() {
  const { user } = useAuth();
  const { org: currentOrg } = useOrg();
  const orgId = currentOrg?.id;

  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [recipientNumber, setRecipientNumber] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [sending, setSending] = useState(false);


  // Fetch SMS messages
  const fetchMessages = async () => {
    if (!orgId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const url = buildApiUrl(`/api/sms/messages?org_id=${orgId}&limit=100`);
      const response = await fetch(url, {
        headers: {
          'x-user-id': user.id,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(Array.isArray(data) ? data : data.messages || []);
      } else {
        setError('Failed to fetch SMS messages');
      }
    } catch (err: any) {
      setError(err?.message || 'Error fetching messages');
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (orgId && user) {
      fetchMessages();
    }
  }, [orgId, user]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!orgId) return;

    const channel = supabaseClient
      .channel(`org-sms-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sms_messages',
          filter: `org_id=eq.${orgId}`
        },
        () => {
          console.log('SMS message updated, refreshing...');
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [orgId]);

  // Handle sending SMS
  const handleSendSMS = async () => {
    if (!orgId || !user || !newMessage || !recipientNumber) {
      setError('Please fill in all fields');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch(
        buildApiUrl(`/api/orgs/${orgId}/sms/send`),
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${user.id}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: recipientNumber,
            message: newMessage
          })
        }
      );

      if (response.ok) {
        setNewMessage('');
        setRecipientNumber('');
        setShowSendModal(false);
        // Refresh messages
        await fetchMessages();
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || 'Failed to send SMS');
      }
    } catch (err: any) {
      setError(err?.message || 'Error sending SMS');
      console.error('Error sending SMS:', err);
    } finally {
      setSending(false);
    }
  };

  if (!orgId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 text-lg">No organization selected</p>
          <p className="text-slate-500 text-sm mt-2">Please select an organization to view SMS messages</p>
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
            <h1 className="text-3xl font-bold text-white">SMS Messages</h1>
            <p className="text-slate-400 mt-2">Manage SMS communication for {currentOrg?.name}</p>
          </div>
          <button
            onClick={() => setShowSendModal(true)}
            className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition font-medium"
          >
            Send SMS
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
            <p className="text-slate-400 text-sm">Total Messages</p>
            <p className="text-3xl font-bold text-white mt-2">{messages.length}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
            <p className="text-slate-400 text-sm">Status</p>
            <p className="text-lg font-semibold text-cyan-400 mt-2">
              {loading ? 'Loading...' : 'Ready'}
            </p>
          </div>
        </div>

        {/* Messages List */}
        <div className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-xl font-semibold text-white">Message History</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <p className="text-slate-400">Loading messages...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-400">No SMS messages yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {messages.slice(0, 50).map((msg) => (
                <div key={msg.id} className="p-4 hover:bg-slate-800/30 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                          msg.direction === 'outbound'
                            ? 'bg-blue-900/40 text-blue-300'
                            : 'bg-green-900/40 text-green-300'
                        }`}>
                          {msg.direction === 'outbound' ? 'Sent' : 'Received'}
                        </span>
                        <span className="text-slate-400 text-sm">
                          {msg.direction === 'outbound' ? 'To' : 'From'}
                        </span>
                        <span className="text-white font-semibold">
                          {msg.direction === 'outbound' ? msg.recipient : msg.sender}
                        </span>
                      </div>
                      <p className="text-slate-300 break-words">{msg.message}</p>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <p className="text-xs text-slate-500">
                        {new Date(msg.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-slate-600">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Send SMS Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4 border border-slate-800">
            <h2 className="text-xl font-bold text-white mb-4">Send SMS</h2>

            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded p-3 mb-4">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Recipient Number
                </label>
                <input
                  type="tel"
                  value={recipientNumber}
                  onChange={(e) => setRecipientNumber(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Message
                </label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
                  rows={4}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSendModal(false)}
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendSMS}
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition font-medium"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SMSPage;

