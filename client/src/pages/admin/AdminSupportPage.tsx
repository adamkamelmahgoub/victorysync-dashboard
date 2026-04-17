import React, { FC, useEffect, useMemo, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../../components/DashboardPrimitives';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(buildApiUrl('/api/admin/support/tickets'), {
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        setError('Failed to fetch tickets');
        return;
      }

      const data = await response.json();
      const nextTickets = data.tickets || [];
      setTickets(nextTickets);
      setSelectedTicket((prev) => nextTickets.find((t: Ticket) => t.id === prev?.id) || prev || nextTickets[0] || null);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      setError('Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedTicket) return;

    try {
      setSending(true);
      setError(null);
      const response = await fetch(buildApiUrl(`/api/admin/support/tickets/${selectedTicket.id}/messages`), {
        method: 'POST',
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: messageText }),
      });

      if (!response.ok) {
        setError('Failed to send message');
        return;
      }

      setMessageText('');
      await fetchTickets();
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedTicket) return;

    try {
      const response = await fetch(buildApiUrl(`/api/admin/support/tickets/${selectedTicket.id}`), {
        method: 'PATCH',
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        setError('Failed to update ticket status');
        return;
      }

      await fetchTickets();
    } catch (error) {
      console.error('Error updating status:', error);
      setError('Failed to update ticket status');
    }
  };

  const filteredTickets = filterStatus === 'all'
    ? tickets
    : tickets.filter((t) => t.status === filterStatus);

  const summary = useMemo(() => {
    const open = tickets.filter((ticket) => ticket.status === 'open').length;
    const inProgress = tickets.filter((ticket) => ticket.status === 'in-progress').length;
    const highPriority = tickets.filter((ticket) => ticket.priority === 'high').length;
    return { total: tickets.length, open, inProgress, highPriority };
  }, [tickets]);

  return (
    <PageLayout
      eyebrow="Admin support"
      title="Support Tickets"
      description="View, triage, and respond to support issues across all client organizations."
      actions={<button onClick={fetchTickets} disabled={loading} className="vs-button-secondary">{loading ? 'Refreshing...' : 'Refresh'}</button>}
    >
      <div className="space-y-6">
        <AdminTopNav />

        {error && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricStatCard label="Tickets" value={summary.total} />
          <MetricStatCard label="Open" value={summary.open} accent="cyan" />
          <MetricStatCard label="In Progress" value={summary.inProgress} accent="emerald" />
          <MetricStatCard label="High Priority" value={summary.highPriority} accent="amber" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr,1.3fr]">
          <SectionCard title="Ticket queue" description="Filter the queue and choose a ticket for triage.">
            <div className="mb-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status Filter</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="vs-input w-full">
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {loading ? (
              <div className="text-sm text-slate-400">Loading tickets...</div>
            ) : filteredTickets.length === 0 ? (
              <EmptyStatePanel title="No tickets found" description="No support tickets matched the current filter." />
            ) : (
              <div className="space-y-3">
                {filteredTickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className={`w-full rounded-3xl border p-4 text-left transition ${
                      selectedTicket?.id === ticket.id
                        ? 'border-cyan-400/20 bg-cyan-400/[0.07]'
                        : 'border-white/8 bg-white/[0.025] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{ticket.subject}</div>
                        <div className="mt-2 text-xs text-slate-500">{ticket.org_id}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <StatusBadge tone={ticket.status === 'open' ? 'info' : ticket.status === 'resolved' ? 'success' : 'neutral'}>{ticket.status}</StatusBadge>
                          <StatusBadge tone={ticket.priority === 'high' ? 'warning' : 'neutral'}>{ticket.priority}</StatusBadge>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">{new Date(ticket.created_at).toLocaleDateString()}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title={selectedTicket?.subject || 'Ticket detail'} description="Update status, review the thread, and reply to the client.">
            {!selectedTicket ? (
              <EmptyStatePanel title="No ticket selected" description="Choose a ticket from the queue to start triage." />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</label>
                    <select
                      value={selectedTicket.status}
                      onChange={(e) => {
                        handleStatusChange(e.target.value);
                        setSelectedTicket({ ...selectedTicket, status: e.target.value });
                      }}
                      className="vs-input w-full"
                    >
                      <option value="open">Open</option>
                      <option value="in-progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Priority</div>
                    <div className="mt-2"><StatusBadge tone={selectedTicket.priority === 'high' ? 'warning' : 'neutral'}>{selectedTicket.priority}</StatusBadge></div>
                  </div>
                </div>

                <div className="text-xs text-slate-500">Created {new Date(selectedTicket.created_at).toLocaleString()}</div>

                <div className="max-h-[360px] space-y-3 overflow-y-auto rounded-3xl border border-white/8 bg-white/[0.02] p-4">
                  {selectedTicket.support_ticket_messages?.map((msg) => (
                    <div key={msg.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="mb-2 text-xs text-slate-500">
                        {msg.sender_user_id === selectedTicket.created_by ? 'Client' : 'You'} · {new Date(msg.created_at).toLocaleString()}
                      </div>
                      <p className="text-sm text-slate-100">{msg.message}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type your response..."
                    className="vs-input min-h-[120px] w-full resize-none"
                    rows={3}
                  />
                  <button onClick={handleSendMessage} disabled={sending || !messageText.trim()} className="vs-button-primary w-full">
                    {sending ? 'Sending...' : 'Send Response'}
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </PageLayout>
  );
};

export default AdminSupportPage;
