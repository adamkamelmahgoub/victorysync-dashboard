import React, { FC, useEffect, useMemo, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../../components/DashboardPrimitives';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';

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
  organizations?: { name: string; id: string };
}

interface Org {
  id: string;
  name: string;
}

const PAGE_SIZE = 500;

function formatTime(message: SMSMessage) {
  const raw = message.created_at || message.message_date || message.sent_at;
  return raw ? new Date(raw).toLocaleString() : '-';
}

const AdminSMSPage: FC = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterOrgId, setFilterOrgId] = useState('');
  const [filterDirection, setFilterDirection] = useState('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [search, setSearch] = useState('');

  const fetchOrgs = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/admin/orgs'), {
        headers: {
          'x-user-id': userId || '',
          'x-dev-bypass': 'true',
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      setOrgs(data.orgs || []);
    } catch (error) {
      console.error('Error fetching orgs:', error);
    }
  };

  const loadMessages = async (reset = false) => {
    if (!userId) return;
    if (!reset && nextOffset == null) return;
    const activeOffset = reset ? 0 : (nextOffset ?? 0);

    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      let url = buildApiUrl(`/api/sms/messages?limit=${PAGE_SIZE}&offset=${activeOffset}`);
      if (filterOrgId) url += `&org_id=${encodeURIComponent(filterOrgId)}`;

      const response = await fetch(url, {
        headers: {
          'x-user-id': userId,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return;
      const data = await response.json();
      let rows: SMSMessage[] = data.messages || [];
      if (filterDirection) {
        rows = rows.filter((message) => String(message.direction || '').toLowerCase() === filterDirection);
      }

      setMessages((previous) => (reset ? rows : [...previous, ...rows]));
      setNextOffset(data.next_offset ?? null);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, [userId]);

  useEffect(() => {
    loadMessages(true);
  }, [filterOrgId, filterDirection, userId]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const intervalId = window.setInterval(() => {
      loadMessages(true);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [autoRefreshEnabled, filterOrgId, filterDirection, userId]);

  const filteredMessages = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return messages;
    return messages.filter((message) => {
      const haystack = [
        message.organizations?.name,
        message.from_number,
        message.to_number,
        message.message_text,
        message.direction,
        message.status,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(term);
    });
  }, [messages, search]);

  const summary = useMemo(() => {
    const inbound = filteredMessages.filter((message) => String(message.direction || '').toLowerCase() === 'inbound').length;
    const outbound = filteredMessages.filter((message) => String(message.direction || '').toLowerCase() === 'outbound').length;
    const uniqueOrgs = new Set(filteredMessages.map((message) => message.org_id).filter(Boolean)).size;
    return { inbound, outbound, uniqueOrgs };
  }, [filteredMessages]);

  return (
    <PageLayout
      eyebrow="Admin messaging"
      title="SMS"
      description="Cross-organization SMS monitoring with tighter filters, cleaner scanning, and a more operational layout."
      actions={<button onClick={() => loadMessages(true)} className="vs-button-secondary">Refresh</button>}
    >
      <div className="space-y-6">
        <AdminTopNav />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricStatCard label="Messages" value={messages.length} hint="Loaded rows in the current window" />
          <MetricStatCard label="Organizations" value={summary.uniqueOrgs} hint="Active orgs in view" accent="cyan" />
          <MetricStatCard label="Inbound" value={summary.inbound} hint="Customer-originated messages" accent="cyan" />
          <MetricStatCard label="Outbound" value={summary.outbound} hint="Messages sent from client workspaces" accent="emerald" />
        </div>

        <SectionCard
          title="Filters"
          description="Keep the message stream organized by organization, direction, and keyword."
          actions={
            <label className="inline-flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
              />
              Auto-refresh (5s)
            </label>
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orgs, numbers, or content"
              className="vs-input w-full"
            />
            <select value={filterOrgId} onChange={(e) => setFilterOrgId(e.target.value)} className="vs-input w-full">
              <option value="">All organizations</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <select value={filterDirection} onChange={(e) => setFilterDirection(e.target.value)} className="vs-input w-full">
              <option value="">All directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <div className="vs-surface-muted flex items-center justify-center px-4 py-3 text-sm text-slate-400">
              {filteredMessages.length} visible message{filteredMessages.length === 1 ? '' : 's'}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Message stream" description="Review the actual conversation flow without raw org ids cluttering the view.">
          {loading ? (
            <div className="text-sm text-slate-400">Loading messages...</div>
          ) : filteredMessages.length === 0 ? (
            <EmptyStatePanel
              title="No messages found"
              description="No SMS messages matched the current admin filters. Adjust the organization, direction, or search criteria."
            />
          ) : (
            <div className="space-y-3">
              {filteredMessages.map((message) => {
                const inbound = String(message.direction || '').toLowerCase() === 'inbound';
                return (
                  <div key={message.id} className="vs-surface-muted p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={inbound ? 'info' : 'success'}>{inbound ? 'Inbound' : 'Outbound'}</StatusBadge>
                          <StatusBadge tone="neutral">{message.organizations?.name || 'Unassigned org'}</StatusBadge>
                          {message.status && <StatusBadge tone="neutral">{message.status}</StatusBadge>}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-400">
                          <span className="font-mono text-xs text-slate-200">{message.from_number || '-'}</span>
                          <span>to</span>
                          <span className="font-mono text-xs text-slate-200">{message.to_number || '-'}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{message.message_text || '-'}</p>
                      </div>
                      <div className="text-xs text-slate-500">{formatTime(message)}</div>
                    </div>
                  </div>
                );
              })}

              {nextOffset !== null && (
                <div className="flex justify-center pt-2">
                  <button onClick={() => loadMessages(false)} disabled={loadingMore} className="vs-button-secondary">
                    {loadingMore ? 'Loading more...' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </PageLayout>
  );
};

export default AdminSMSPage;
