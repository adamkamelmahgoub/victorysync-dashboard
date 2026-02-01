import React, { FC, useState, useEffect } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';

interface Message {
  id: string;
  message: string;
  sender_user_id: string;
  created_at: string;
}

interface Ticket {
  id: string;
  org_id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  support_ticket_messages?: Message[];
}

const AdminSupportPage: FC = () => {
  const { user } = useAuth();
  const userId = user?.id;
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:4000/api/admin/support/tickets', {
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch tickets');
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

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedTicket) return;

    try {
      setSending(true);
      const response = await fetch(`http://localhost:4000/api/admin/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: messageText })
      });

      if (!response.ok) {
        alert('Failed to send message');
        return;
      }

      setMessageText('');
      fetchTickets();
      // Re-select to show updated messages
      const updatedTicket = tickets.find(t => t.id === selectedTicket.id);
      if (updatedTicket) setSelectedTicket(updatedTicket);
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedTicket) return;

    try {
      const response = await fetch(`http://localhost:4000/api/admin/support/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        alert('Failed to update ticket status');
        return;
      }

      fetchTickets();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const filteredTickets = filterStatus === 'all' 
    ? tickets 
    : tickets.filter(t => t.status === filterStatus);

  return (
    <PageLayout title="Support Tickets" description="View and manage all support tickets from clients">
      <div className="space-y-6">

        <AdminTopNav />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tickets List */}
          <div className="lg:col-span-1 bg-slate-900/80 ring-1 ring-slate-800 rounded-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs font-semibold text-slate-300">Filter by Status:</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="in-progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="text-xs text-slate-400">
                {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-slate-400 text-xs">Loading tickets...</div>
              ) : filteredTickets.length === 0 ? (
                <div className="p-4 text-slate-400 text-xs">No tickets found</div>
              ) : (
                filteredTickets.map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className={`w-full text-left p-4 border-b border-slate-700/50 hover:bg-slate-800/50 transition ${
                      selectedTicket?.id === ticket.id ? 'bg-slate-800/50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs text-white truncate">{ticket.subject}</div>
                        <div className="text-xs text-slate-400 mt-1">{ticket.org_id}</div>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${
                        ticket.status === 'open' ? 'bg-amber-900/50 text-amber-200 ring-1 ring-amber-800/50' :
                        ticket.status === 'in-progress' ? 'bg-blue-900/50 text-blue-200 ring-1 ring-blue-800/50' :
                        ticket.status === 'resolved' ? 'bg-emerald-900/50 text-emerald-200 ring-1 ring-emerald-800/50' :
                        'bg-slate-700/50 text-slate-300'
                      }`}>
                        {ticket.status}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Ticket Details */}
          <div className="lg:col-span-2">
            {selectedTicket ? (
              <div className="bg-slate-900/80 ring-1 ring-slate-800 rounded-lg p-6 flex flex-col h-full">
                <div className="space-y-4 pb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{selectedTicket.subject}</h2>
                    <p className="text-xs text-slate-400 mt-1">Organization: {selectedTicket.org_id}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 font-semibold">Status</label>
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => {
                          handleStatusChange(e.target.value);
                          setSelectedTicket({ ...selectedTicket, status: e.target.value });
                        }}
                        className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      >
                        <option value="open">Open</option>
                        <option value="in-progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-semibold">Priority</label>
                      <div className={`mt-1 px-3 py-2 rounded text-xs font-semibold ${
                        selectedTicket.priority === 'high' ? 'bg-red-900/50 text-red-200 ring-1 ring-red-800/50' :
                        selectedTicket.priority === 'normal' ? 'bg-blue-900/50 text-blue-200 ring-1 ring-blue-800/50' :
                        'bg-slate-700/50 text-slate-300'
                      }`}>
                        {selectedTicket.priority}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400">
                    Created: {new Date(selectedTicket.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="border-t border-slate-700/50 pt-4 flex-1 overflow-y-auto">
                  <div className="space-y-4 mb-4">
                    {selectedTicket.support_ticket_messages?.map(msg => (
                      <div key={msg.id} className="bg-slate-800/30 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-2">
                          {msg.sender_user_id === selectedTicket.created_by ? 'Client' : 'You'} • {new Date(msg.created_at).toLocaleString()}
                        </div>
                        <p className="text-xs text-slate-100">{msg.message}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-700/50 pt-4">
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type your response..."
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 text-xs mb-3 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    rows={3}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !messageText.trim()}
                    className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg text-xs transition"
                  >
                    {sending ? 'Sending...' : 'Send Response'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/80 ring-1 ring-slate-800 rounded-lg p-6 text-center text-slate-400">
                <p className="text-xs">Select a ticket to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default AdminSupportPage;
