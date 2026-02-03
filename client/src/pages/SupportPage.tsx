import React, { FC, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import { buildApiUrl } from '../config';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  support_ticket_messages?: Message[];
}

interface Message {
  id: string;
  message: string;
  sender_user_id: string;
  created_at: string;
}

const SupportPage: FC = () => {
  const { user } = useAuth();
  const userId = user?.id;
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newPriority, setNewPriority] = useState('normal');
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/api/support/tickets'), {
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        console.error(`Error: ${errData.error || 'Failed to fetch tickets'}`);
        return;
      }

      const data = await response.json();
      setTickets(data.tickets || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim()) {
      alert('Please enter a subject');
      return;
    }

    try {
      const response = await fetch(buildApiUrl('/api/support/tickets'), {
        method: 'POST',
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject: newSubject,
          message: newMessage,
          priority: newPriority
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        alert(`Error: ${errData.error || 'Failed to create ticket'}`);
        return;
      }

      alert('Ticket created successfully');
      setNewSubject('');
      setNewMessage('');
      setNewPriority('normal');
      
      await fetchTickets();
    } catch (error) {
      console.error('Error creating ticket:', error);
      alert('Failed to create ticket');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !messageText.trim()) {
      alert('Please enter a message');
      return;
    }

    try {
      setSending(true);
      const response = await fetch(
        buildApiUrl(`/api/support/tickets/${selectedTicket.id}/messages`),
        {
          method: 'POST',
          headers: {
            'x-user-id': userId || '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: messageText })
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        alert(`Error: ${errData.error || 'Failed to send message'}`);
        return;
      }

      alert('Message sent');
      setMessageText('');
      
      await fetchTickets();
      
      if (selectedTicket) {
        const updated = tickets.find(t => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (!userId) {
    return (
      <PageLayout title="Support Tickets" description="Manage your support tickets and contact support">
        <div className="bg-slate-900 rounded-lg p-8 border border-slate-700 text-center">
          <p className="text-red-400">Not authenticated. Please log in first.</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Support Tickets" description="Manage your support tickets and contact support">
      <div className="space-y-6">
        {/* Create Ticket Card */}
        <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800 backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-white mb-6">Create New Ticket</h2>
          <form onSubmit={handleCreateTicket} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2.5">Subject</label>
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Brief description of your issue"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2.5">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2.5">Message</label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Provide additional details about your issue"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition resize-none"
                rows={4}
              />
            </div>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 text-white font-semibold py-3 rounded-lg transition duration-200"
            >
              Create Ticket
            </button>
          </form>
        </div>

        {/* Tickets List */}
        {loading ? (
          <div className="bg-slate-900/80 rounded-xl p-8 ring-1 ring-slate-800 text-center">
            <p className="text-slate-400">Loading tickets...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="bg-slate-900/80 rounded-xl p-8 ring-1 ring-slate-800 text-center">
            <p className="text-slate-400">No support tickets yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tickets List Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Your Tickets</h3>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-slate-800/60 text-slate-300 ring-1 ring-slate-700">
                {tickets.length} total
              </span>
            </div>

            {/* Tickets Grid */}
            <div className="grid gap-4">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`bg-slate-900/80 rounded-lg p-5 ring-1 cursor-pointer transition duration-200 ${
                    selectedTicket?.id === ticket.id
                      ? 'ring-cyan-500/50 bg-slate-900'
                      : 'ring-slate-800 hover:ring-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <h4 className="text-white font-semibold">{ticket.subject}</h4>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          ticket.status === 'open' ? 'bg-blue-900/40 text-blue-300' :
                          ticket.status === 'closed' ? 'bg-green-900/40 text-green-300' :
                          'bg-slate-700/40 text-slate-300'
                        }`}>
                          {ticket.status}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(ticket.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                      ticket.priority === 'high' ? 'bg-red-900/40 text-red-300' :
                      ticket.priority === 'normal' ? 'bg-amber-900/40 text-amber-300' :
                      'bg-green-900/40 text-green-300'
                    }`}>
                      {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Ticket Details Card */}
            {selectedTicket && (
              <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800 mt-6">
                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-white mb-3">{selectedTicket.subject}</h3>
                  <div className="flex items-center gap-3">
                    <span className="inline-block px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-900/40 text-cyan-300 ring-1 ring-cyan-700/50">
                      {selectedTicket.status}
                    </span>
                  </div>
                </div>

                {/* Messages Section */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-white mb-4">Conversation Thread</h4>
                  <div className="bg-slate-800/30 rounded-lg p-5 max-h-72 overflow-y-auto ring-1 ring-slate-700 space-y-4">
                    {selectedTicket.support_ticket_messages && selectedTicket.support_ticket_messages.length > 0 ? (
                      selectedTicket.support_ticket_messages.map((msg) => (
                        <div key={msg.id} className="border-l-2 border-slate-700 pl-4 py-2">
                          <p className="text-slate-300 text-sm">{msg.message}</p>
                          <p className="text-xs text-slate-500 mt-2">
                            {new Date(msg.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 text-sm text-center py-4">No messages yet</p>
                    )}
                  </div>
                </div>

                {/* Reply Form */}
                <form onSubmit={handleSendMessage} className="space-y-4">
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type your message..."
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition resize-none"
                    rows={3}
                  />
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold py-3 rounded-lg transition duration-200"
                  >
                    {sending ? 'Sending...' : 'Send Reply'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export { SupportPage };
