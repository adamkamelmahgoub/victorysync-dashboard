import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { getOrgPhoneNumbers, type PhoneNumber } from '../lib/phonesApi';
import { sendSmsMessage, triggerMightyCallSMSSync } from '../lib/apiClient';

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

function formatTime(message: SMSMessage) {
  const raw = message.created_at || message.message_date || message.sent_at;
  return raw ? new Date(raw).toLocaleString() : '-';
}

function conversationKey(message: SMSMessage) {
  const direction = String(message.direction || '').toLowerCase();
  return direction === 'outbound'
    ? (message.to_number || message.from_number || 'Unknown')
    : (message.from_number || message.to_number || 'Unknown');
}

export function SMSPage() {
  const { user, orgs, selectedOrgId, globalRole } = useAuth();
  const { org: currentOrg } = useOrg();
  const isPlatformAdmin = globalRole === 'platform_admin' || globalRole === 'admin';
  const orgId = isPlatformAdmin
    ? (selectedOrgId || null)
    : (((user?.user_metadata as any)?.org_id ?? null) || selectedOrgId || currentOrg?.id || null);
  const orgName = orgId
    ? (orgs.find((o) => o.id === orgId)?.name || currentOrg?.name || 'your organization')
    : 'all organizations';

  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [recipientNumber, setRecipientNumber] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [senderNumbers, setSenderNumbers] = useState<PhoneNumber[]>([]);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [search, setSearch] = useState('');
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound' | 'unknown'>('all');

  const syncMessages = async () => {
    if (!orgId || !user?.id) return;
    setSyncing(true);
    try {
      await triggerMightyCallSMSSync(orgId, user.id);
    } finally {
      setSyncing(false);
    }
  };

  const loadMessages = async (reset = false, options?: { syncFirst?: boolean }) => {
    if (!user) return;
    if (!reset && nextOffset == null) return;

    const activeOffset = reset ? 0 : (nextOffset ?? 0);
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      if (reset && options?.syncFirst && orgId) {
        await syncMessages();
      }

      const q = new URLSearchParams();
	      q.set('limit', String(PAGE_SIZE));
	      q.set('offset', String(activeOffset));
	      if (orgId) q.set('org_id', orgId);
	      if (search.trim()) q.set('search', search.trim());

      const response = await fetch(buildApiUrl(`/api/sms/messages?${q.toString()}`), {
        headers: {
          'x-user-id': user.id,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        setError('Failed to fetch SMS messages');
        return;
      }

      const data = await response.json();
      const rows: SMSMessage[] = data.messages || [];
      setMessages((previous) => (reset ? rows : [...previous, ...rows]));
      setNextOffset(data.next_offset ?? null);
      if (reset) setEmptyReason(data.empty_reason || null);
    } catch (err: any) {
      setError(err?.message || 'Error fetching messages');
      console.error('Error fetching messages:', err);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

	  useEffect(() => {
	    if (user) loadMessages(true, { syncFirst: true });
	  }, [orgId, user?.id]);

	  useEffect(() => {
	    if (!user?.id) return;
	    const tick = () => {
	      if (document.visibilityState === 'visible') {
	        void loadMessages(true);
	      }
	    };
	    const intervalId = window.setInterval(tick, 10000);
	    const onVisibility = () => {
	      if (document.visibilityState === 'visible') tick();
	    };
	    document.addEventListener('visibilitychange', onVisibility);
	    return () => {
	      window.clearInterval(intervalId);
	      document.removeEventListener('visibilitychange', onVisibility);
	    };
	  }, [user?.id, orgId, search]);

  useEffect(() => {
    let cancelled = false;
    const loadSenderNumbers = async () => {
      if ((!orgId && !isPlatformAdmin) || !user?.id) {
        setSenderNumbers([]);
        setFromNumber('');
        return;
      }
      try {
        const rows = isPlatformAdmin
          ? await fetch(buildApiUrl('/api/admin/phone-numbers'), { headers: { 'x-user-id': user.id } })
              .then(async (response) => {
                if (!response.ok) throw new Error('Failed to fetch sender numbers');
                const data = await response.json();
                return (data.phone_numbers || data.numbers || []).map((row: any) => ({
                  ...row,
                  org_id: row.org_id || row.orgId || null,
                })) as PhoneNumber[];
              })
          : await getOrgPhoneNumbers(orgId, user.id);
        if (cancelled) return;
        const usable = (rows || []).filter((row) => row.number);
        setSenderNumbers(usable);
        setFromNumber((previous) => previous && usable.some((row) => row.number === previous) ? previous : usable[0]?.number || '');
      } catch (err) {
        if (cancelled) return;
        setSenderNumbers([]);
        setFromNumber('');
      }
    };
    void loadSenderNumbers();
    return () => {
      cancelled = true;
    };
  }, [orgId, user?.id, isPlatformAdmin]);

  const handleSendSMS = async () => {
    const selectedSender = senderNumbers.find((number) => number.number === fromNumber);
    const sendOrgId = orgId || selectedSender?.org_id || (selectedSender as any)?.orgId || null;
    if (!sendOrgId || !user || !newMessage || !recipientNumber || !fromNumber) {
      setError('Please fill in all fields');
      return;
    }

    setSending(true);
    setError(null);

    try {
	      await sendSmsMessage({ orgId: sendOrgId, from: fromNumber, to: recipientNumber, message: newMessage }, user.id);

      setNewMessage('');
      setRecipientNumber('');
      setFromNumber((previous) => previous || senderNumbers[0]?.number || '');
      setShowSendModal(false);
      await loadMessages(true);
    } catch (err: any) {
      setError(err?.message || 'Error sending SMS');
    } finally {
      setSending(false);
    }
  };

  const filteredMessages = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return messages;
    return messages.filter((message) => {
      const haystack = [
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
  }, [messages, search]).filter((message) => {
    if (directionFilter === 'all') return true;
    const direction = String(message.direction || '').toLowerCase();
    if (directionFilter === 'unknown') return direction !== 'inbound' && direction !== 'outbound';
    return direction === directionFilter;
  });

	  const summary = useMemo(() => {
    const inbound = filteredMessages.filter((message) => String(message.direction || '').toLowerCase() === 'inbound').length;
    const outbound = filteredMessages.filter((message) => String(message.direction || '').toLowerCase() === 'outbound').length;
    const unknown = filteredMessages.length - inbound - outbound;
    return { inbound, outbound, unknown };
	  }, [filteredMessages]);

	  const conversations = useMemo(() => {
	    const groups = new Map<string, SMSMessage[]>();
	    for (const message of filteredMessages) {
	      const key = conversationKey(message);
	      const rows = groups.get(key) || [];
	      rows.push(message);
	      groups.set(key, rows);
	    }
	    return Array.from(groups.entries()).map(([number, rows]) => ({
	      number,
	      rows: rows.slice().sort((a, b) => {
	        const aTime = Date.parse(a.sent_at || a.message_date || a.created_at || '');
	        const bTime = Date.parse(b.sent_at || b.message_date || b.created_at || '');
	        return (aTime || 0) - (bTime || 0);
	      }),
	      latest: rows.slice().sort((a, b) => {
	        const aTime = Date.parse(a.sent_at || a.message_date || a.created_at || '');
	        const bTime = Date.parse(b.sent_at || b.message_date || b.created_at || '');
	        return (bTime || 0) - (aTime || 0);
	      })[0],
	    })).sort((a, b) => {
	      const aTime = Date.parse(a.latest?.sent_at || a.latest?.message_date || a.latest?.created_at || '');
	      const bTime = Date.parse(b.latest?.sent_at || b.latest?.message_date || b.latest?.created_at || '');
	      return (bTime || 0) - (aTime || 0);
	    });
	  }, [filteredMessages]);

  const emptyCopy = search.trim()
    ? {
        title: 'No matching messages',
        description: 'No SMS rows match the current search.',
      }
    : emptyReason === 'no_assigned_numbers'
      ? {
          title: 'No assigned numbers',
          description: 'This account is not assigned to any SMS-capable phone numbers yet.',
        }
      : emptyReason === 'no_org_membership'
        ? {
            title: 'No organization access',
            description: 'This account is not linked to an organization that can view SMS.',
          }
        : {
            title: 'No synced SMS messages',
            description: 'Once owned-number SMS is synced, messages will appear here.',
          };

  if (!isPlatformAdmin && !orgId && (!orgs || orgs.length === 0)) {
    return (
      <PageLayout title="SMS" description="No organization selected">
        <EmptyStatePanel
          title="No organization linked"
          description="No organization is linked to this account yet. Ask your org admin to assign your account to an organization before using SMS."
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      eyebrow="Messaging"
      title="SMS"
      description={`Organized conversation history and outbound messaging for ${orgName}.`}
      actions={
        <button onClick={() => setShowSendModal(true)} className="vs-button-primary">
          Send SMS
        </button>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricStatCard label="Messages" value={messages.length} hint={orgName} />
          <MetricStatCard label="Inbound" value={summary.inbound} hint="Customer-originated messages" accent="cyan" />
          <MetricStatCard label="Outbound" value={summary.outbound} hint="Messages sent from the workspace" accent="emerald" />
          <MetricStatCard label="Unknown" value={summary.unknown} hint="Needs direction metadata" accent="neutral" />
        </div>

        <SectionCard title="Message stream" description="Search, scan, and review your SMS traffic in one place.">
          <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr),auto,auto]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search numbers, statuses, or message text"
              className="vs-input w-full"
            />
            <div className="grid grid-cols-4 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {(['all', 'inbound', 'outbound', 'unknown'] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setDirectionFilter(value)}
                  className={`px-3 py-3 transition ${directionFilter === value ? 'bg-cyan-400/[0.12] text-cyan-100' : 'hover:bg-white/[0.04]'}`}
                >
                  {value === 'all' ? 'All' : value}
                </button>
              ))}
            </div>
            <button onClick={() => loadMessages(true, { syncFirst: true })} disabled={loading || syncing} className="vs-button-secondary">
              {loading || syncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-slate-400">Loading messages...</div>
          ) : filteredMessages.length === 0 ? (
            <EmptyStatePanel
              title={emptyCopy.title}
              description={emptyCopy.description}
            />
          ) : (
	            <div className="space-y-4">
	              {conversations.map((conversation) => (
	                <div key={conversation.number} className="vs-surface-muted p-4">
	                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
	                    <div>
	                      <div className="font-mono text-sm font-semibold text-white">{conversation.number}</div>
	                      <div className="mt-1 text-xs text-slate-500">{conversation.rows.length} message{conversation.rows.length === 1 ? '' : 's'}</div>
	                    </div>
	                    <div className="text-xs text-slate-500">{conversation.latest ? formatTime(conversation.latest) : '-'}</div>
	                  </div>
	                  <div className="space-y-3">
	                    {conversation.rows.map((message) => {
	                      const direction = String(message.direction || '').toLowerCase();
	                      const inbound = direction === 'inbound';
	                      const outbound = direction === 'outbound';
	                      return (
	                        <div key={message.id} className={`rounded-2xl border px-4 py-3 ${outbound ? 'ml-auto max-w-[92%] border-emerald-400/15 bg-emerald-400/[0.04]' : 'mr-auto max-w-[92%] border-cyan-400/15 bg-cyan-400/[0.04]'}`}>
	                          <div className="flex flex-wrap items-center gap-2">
	                            <StatusBadge tone={inbound ? 'info' : outbound ? 'success' : 'neutral'}>
	                              {inbound ? 'Inbound' : outbound ? 'Outbound' : 'Unknown'}
	                            </StatusBadge>
	                            {message.status && <StatusBadge tone="neutral">{message.status}</StatusBadge>}
	                          </div>
	                          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
	                            <span className="font-mono text-xs text-slate-200">{message.from_number || '-'}</span>
	                            <span>to</span>
	                            <span className="font-mono text-xs text-slate-200">{message.to_number || '-'}</span>
	                          </div>
	                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{message.message_text || '-'}</p>
	                          <div className="mt-2 text-xs text-slate-500">{formatTime(message)}</div>
	                        </div>
	                      );
	                    })}
	                  </div>
	                </div>
	              ))}

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

      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="vs-surface w-full max-w-lg p-6">
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-white">Send SMS</h2>
              <p className="mt-2 text-sm text-slate-400">Send an outbound SMS without leaving the dashboard.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">From</label>
                <select
                  value={fromNumber}
                  onChange={(e) => setFromNumber(e.target.value)}
                  className="vs-input w-full"
                >
                  {senderNumbers.length === 0 ? (
                    <option value="">No assigned SMS numbers</option>
                  ) : (
                    senderNumbers.map((number) => (
                      <option key={number.id || number.number} value={number.number}>
                        {number.number}{number.label ? ` - ${number.label}` : ''}{isPlatformAdmin && (number.org_id || (number as any).orgId) ? ` - ${orgs.find((org) => org.id === (number.org_id || (number as any).orgId))?.name || 'Org'}` : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recipient Number</label>
                <input
                  type="tel"
                  value={recipientNumber}
                  onChange={(e) => setRecipientNumber(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="vs-input w-full"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Message</label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="vs-input min-h-[140px] w-full resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowSendModal(false)} disabled={sending} className="vs-button-secondary flex-1">
                  Cancel
                </button>
                <button onClick={handleSendSMS} disabled={sending || !fromNumber} className="vs-button-primary flex-1">
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
