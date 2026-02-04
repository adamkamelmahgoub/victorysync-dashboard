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
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSendModal, setShowSendModal] = useState(false);
  const [formData, setFormData] = useState({
    phone_number_id: '',
    recipient: '',
    message: '',
  });
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  // Load SMS messages
  useEffect(() => {
    const loadMessages = async () => {
      if (!currentOrg?.id || !user?.id) return;
      try {
        const response = await fetch(
          buildApiUrl(`/api/admin/mightycall/sms-logs`),
          {
            headers: { 'x-user-id': user.id },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages || []);
        }
      } catch (error) {
        console.error('Failed to load SMS:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [currentOrg?.id, user?.id]);

  // Load phone numbers for sending
  useEffect(() => {
    const loadPhoneNumbers = async () => {
      if (!currentOrg?.id || !user?.id) return;
      try {
        const response = await fetch(
          buildApiUrl(`/api/orgs/${currentOrg.id}/phone-numbers`),
          {
            headers: { 'x-user-id': user.id },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setPhoneNumbers(data.phoneNumbers || []);
        }
      } catch (error) {
        console.error('Failed to load phone numbers:', error);
      }
    };

    loadPhoneNumbers();
  }, [currentOrg?.id, user?.id]);

  // Subscribe to real-time SMS updates
  useEffect(() => {
    if (!currentOrg?.id) return;

    const channel = supabaseClient
      .channel(`sms_messages:org_id=eq.${currentOrg.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sms_messages',
          filter: `org_id=eq.${currentOrg.id}`,
        },
        (payload) => {
          console.log('[Realtime] SMS update:', payload);

          if (payload.eventType === 'INSERT') {
            setMessages((prev) => [payload.new as SMSMessage, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === payload.new.id ? (payload.new as SMSMessage) : m
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [currentOrg?.id]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg?.id || !user?.id) return;

    setSending(true);

    try {
      const response = await fetch(buildApiUrl(`/api/admin/mightycall/send-sms`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({
          org_id: currentOrg.id,
          phone_number_id: formData.phone_number_id,
          recipient: formData.recipient,
          message: formData.message,
        }),
      });

      if (response.ok) {
        setFormData({ phone_number_id: '', recipient: '', message: '' });
        setShowSendModal(false);
        // Message will appear via real-time subscription
      }
    } catch (error) {
      console.error('Failed to send SMS:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">SMS Messages</h1>
            <p className="text-slate-400">
              Send and manage SMS communications
            </p>
          </div>
          <button
            onClick={() => setShowSendModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg font-medium hover:from-cyan-700 hover:to-blue-700 transition-all"
          >
            Send SMS
          </button>
        </div>

        {/* Messages List */}
        <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No SMS messages yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      From
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      To
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      Message
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      Direction
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((msg) => (
                    <tr
                      key={msg.id}
                      className="border-b border-slate-700 hover:bg-slate-800 transition-colors"
                    >
                      <td className="px-6 py-3 text-sm text-slate-300">
                        {new Date(msg.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-300">
                        {msg.sender}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-300">
                        {msg.recipient}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-400 max-w-xs truncate">
                        {msg.message}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            msg.direction === 'inbound'
                              ? 'bg-green-900 text-green-200'
                              : 'bg-blue-900 text-blue-200'
                          }`}
                        >
                          {msg.direction === 'inbound' ? '↓ Inbound' : '↑ Outbound'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-400">{msg.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Send SMS Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-white mb-6">Send SMS</h2>
            <form onSubmit={handleSend}>
              <div className="mb-4">
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  From (Phone Number)
                </label>
                <select
                  value={formData.phone_number_id}
                  onChange={(e) =>
                    setFormData({ ...formData, phone_number_id: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                  required
                >
                  <option value="">Select phone number...</option>
                  {phoneNumbers.map((phone) => (
                    <option key={phone.id} value={phone.id}>
                      {phone.phone_number}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  To (Recipient)
                </label>
                <input
                  type="tel"
                  value={formData.recipient}
                  onChange={(e) =>
                    setFormData({ ...formData, recipient: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="+1234567890"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Message
                </label>
                <textarea
                  value={formData.message}
                  onChange={(e) =>
                    setFormData({ ...formData, message: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                  rows={4}
                  placeholder="Type your message..."
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg font-medium hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50 transition-all"
                >
                  {sending ? 'Sending...' : 'Send SMS'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSendModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg font-medium hover:bg-slate-700 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SMSPage;
