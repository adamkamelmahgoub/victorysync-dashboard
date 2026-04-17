import React, { FC, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  const summary = useMemo(() => {
    const open = tickets.filter((ticket) => ticket.status === 'open').length;
    const highPriority = tickets.filter((ticket) => ticket.priority === 'high').length;
    return { total: tickets.length, open, highPriority };
  }, [tickets]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(buildApiUrl('/api/support/tickets'), {
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || 'Failed to fetch tickets');
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

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim()) {
      setError('Please enter a subject');
      return;
    }

    try {
      setError(null);
      const response = await fetch(buildApiUrl('/api/support/tickets'), {
        method: 'POST',
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: newSubject,
          message: newMessage,
          priority: newPriority,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || 'Failed to create ticket');
        return;
      }

      setNewSubject('');
      setNewMessage('');
      setNewPriority('normal');
      await fetchTickets();
    } catch (error) {
      console.error('Error creating ticket:', error);
      setError('Failed to create ticket');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !messageText.trim()) {
      setError('Please enter a message');
      return;
    }

    try {
      setSending(true);
      setError(null);
      const response = await fetch(
        buildApiUrl(`/api/support/tickets/${selectedTicket.id}/messages`),
        {
          method: 'POST',
          headers: {
            'x-user-id': userId || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: messageText }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || 'Failed to send message');
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

  if (!userId) {
    return (
      <PageLayout eyebrow="Support" title="Support Tickets" description="Manage your support tickets and contact support">
        <EmptyStatePanel title="Not authenticated" description="Please log in before managing support tickets." />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      eyebrow="Support"
      title="Support Tickets"
      description="Open new issues, review existing threads, and keep communication with support organized."
      actions={<button onClick={fetchTickets} disabled={loading} className="vs-button-secondary">{loading ? 'Refreshing...' : 'Refresh'}</button>}
    >
      <div className="space-y-6">
        {error && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricStatCard label="Tickets" value={summary.total} />
          <MetricStatCard label="Open" value={summary.open} accent="cyan" />
          <MetricStatCard label="High Priority" value={summary.highPriority} accent="amber" />
        </div>

        <SectionCard title="Create new ticket" description="Capture the issue clearly so support can route and respond quickly.">
          <form onSubmit={handleCreateTicket} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Subject</label>
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Brief description of your issue"
                className="vs-input w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Priority</label>
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="vs-input w-full">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" className="vs-button-primary w-full">Create Ticket</button>
            </div>
            <div className="lg:col-span-2">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Message</label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Provide additional detail about the issue, affected workflow, and urgency."
                className="vs-input min-h-[140px] w-full resize-none"
                rows={4}
              />
            </div>
          </form>
        </SectionCard>

        {loading ? (
          <SectionCard title="Your tickets" description="Loading your current ticket history.">
            <div className="text-sm text-slate-400">Loading tickets...</div>
          </SectionCard>
        ) : tickets.length === 0 ? (
          <EmptyStatePanel title="No support tickets yet" description="Create your first ticket above to start a support conversation." />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[0.95fr,1.25fr]">
            <SectionCard title="Ticket list" description="Select a ticket to review its latest thread and reply.">
              <div className="space-y-3">
                {tickets.map((ticket) => (
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
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge tone={ticket.status === 'open' ? 'info' : 'neutral'}>{ticket.status}</StatusBadge>
                          <StatusBadge tone={ticket.priority === 'high' ? 'warning' : 'neutral'}>{ticket.priority}</StatusBadge>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">{new Date(ticket.created_at).toLocaleDateString()}</div>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title={selectedTicket?.subject || 'Conversation thread'} description="Message history and reply composer for the selected ticket.">
              {!selectedTicket ? (
                <EmptyStatePanel title="No ticket selected" description="Choose a ticket from the list to see the conversation thread." />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={selectedTicket.status === 'open' ? 'info' : 'neutral'}>{selectedTicket.status}</StatusBadge>
                    <StatusBadge tone={selectedTicket.priority === 'high' ? 'warning' : 'neutral'}>{selectedTicket.priority}</StatusBadge>
                  </div>

                  <div className="max-h-[360px] space-y-3 overflow-y-auto rounded-3xl border border-white/8 bg-white/[0.02] p-4">
                    {selectedTicket.support_ticket_messages && selectedTicket.support_ticket_messages.length > 0 ? (
                      selectedTicket.support_ticket_messages.map((msg) => (
                        <div key={msg.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                          <p className="text-sm text-slate-200">{msg.message}</p>
                          <p className="mt-2 text-xs text-slate-500">{new Date(msg.created_at).toLocaleString()}</p>
                        </div>
                      ))
                    ) : (
                      <p className="py-6 text-center text-sm text-slate-400">No messages yet.</p>
                    )}
                  </div>

                  <form onSubmit={handleSendMessage} className="space-y-3">
                    <textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Type your reply..."
                      className="vs-input min-h-[120px] w-full resize-none"
                      rows={3}
                    />
                    <button type="submit" disabled={sending} className="vs-button-primary w-full">
                      {sending ? 'Sending...' : 'Send Reply'}
                    </button>
                  </form>
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export { SupportPage };
