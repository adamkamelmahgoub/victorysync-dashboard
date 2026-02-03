import React, { FC, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  created_by: string;
  support_ticket_messages?: Message[];
}

interface Message {
  id: string;
  message: string;
  sender_user_id: string;
  created_at: string;
}

const AdminSupportPage: FC = () => {
  const { user } = useAuth();
  const userId = user?.id;
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/api/admin/support-tickets'), {
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

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);
    setNewPriority(ticket.priority);
  };

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    try {
      setUpdating(true);
      const response = await fetch(
        buildApiUrl(`/api/admin/support-tickets/${selectedTicket.id}`),
        {
          method: 'PATCH',
          headers: {
            'x-user-id': userId || '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: newStatus,
            priority: newPriority
          })
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        alert(`Error: ${errData.error || 'Failed to update ticket'}`);
        return;
      }

      alert('✓ Ticket updated successfully');
      
      // Refresh tickets
      await fetchTickets();
    } catch (error) {
      console.error('Error updating ticket:', error);
      alert('Failed to update ticket');
    } finally {
      setUpdating(false);
    }
  };

  if (!userId) {
    return (
      <div className="p-8 text-center text-red-400">
        <p>Not authenticated. Please log in first.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">Admin - Support Tickets</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Tickets List */}
        <div className="lg:col-span-1 bg-slate-900 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">All Tickets</h2>
          {loading ? (
            <div className="text-center text-slate-400">Loading...</div>
          ) : tickets.length === 0 ? (
            <div className="text-center text-slate-400">No support tickets</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => handleSelectTicket(ticket)}
                  className={`p-3 rounded cursor-pointer border transition ${
                    selectedTicket?.id === ticket.id
                      ? 'border-blue-500 bg-blue-900/20'
                      : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'
                  }`}
                >
                  <h3 className="font-semibold text-white text-sm">{ticket.subject}</h3>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-slate-400">{ticket.status}</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      ticket.priority === 'high' ? 'bg-red-900 text-red-100' :
                      ticket.priority === 'normal' ? 'bg-yellow-900 text-yellow-100' :
                      'bg-green-900 text-green-100'
                    }`}>
                      {ticket.priority}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ticket Details and Update Form */}
        <div className="lg:col-span-2">
          {selectedTicket ? (
            <div className="bg-slate-900 rounded-lg p-6 border border-slate-700 space-y-6">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">{selectedTicket.subject}</h3>
                <p className="text-sm text-slate-400">
                  Created: {new Date(selectedTicket.created_at).toLocaleString()}
                </p>
              </div>

              {/* Messages */}
              <div>
                <h4 className="text-lg font-semibold text-white mb-3">Messages</h4>
                <div className="bg-slate-800 rounded p-4 max-h-64 overflow-y-auto space-y-3">
                  {selectedTicket.support_ticket_messages && selectedTicket.support_ticket_messages.length > 0 ? (
                    selectedTicket.support_ticket_messages.map((msg) => (
                      <div key={msg.id} className="border-l-2 border-slate-700 pl-3">
                        <p className="text-slate-300">{msg.message}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(msg.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400">No messages</p>
                  )}
                </div>
              </div>

              {/* Update Form */}
              <form onSubmit={handleUpdateTicket} className="space-y-4 bg-slate-800 rounded p-4">
                <h4 className="text-lg font-semibold text-white">Update Ticket</h4>
                
                <div>
                  <label className="block text-sm text-slate-300 mb-2">Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting">Waiting</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={updating}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white font-semibold py-2 rounded"
                >
                  {updating ? 'Updating...' : 'Update Ticket'}
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-slate-900 rounded-lg p-6 border border-slate-700 text-center text-slate-400">
              Select a ticket to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminSupportPage;
