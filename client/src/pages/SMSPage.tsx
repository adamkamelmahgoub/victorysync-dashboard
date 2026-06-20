import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { buildApiUrl } from '../config';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, LoadingSkeleton, MetricStatCard, SectionCard, SegmentedControl, StatusBadge } from '../components/DashboardPrimitives';
import { getOrgPhoneNumbers, type PhoneNumber } from '../lib/phonesApi';
import { fetchJson, sendSmsMessage, triggerMightyCallSMSSync } from '../lib/apiClient';
import { formatPhoneNumber, normalizePhoneDigits, normalizeSmsDirection } from '../lib/reportingMetrics';

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

function messageTimeValue(message: SMSMessage) {
  return Date.parse(message.sent_at || message.message_date || message.created_at || '') || 0;
}

function messagePreview(message?: string | null) {
  const text = String(message || '').trim();
  if (!text) return '-';
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
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

  const ownedDigits = useMemo(() => new Set(senderNumbers.map((row) => normalizePhoneDigits(row.number)).filter(Boolean)), [senderNumbers]);

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
      if (options?.syncFirst) await syncMessages();
      const q = new URLSearchParams();
	      q.set('limit', String(PAGE_SIZE));
		      q.set('offset', String(activeOffset));
		      if (orgId) q.set('org_id', orgId);
		      if (search.trim()) q.set('search', search.trim());
		      if (directionFilter !== 'all') q.set('direction', directionFilter);

      const data = await fetchJson(`/api/reports/sms?${q.toString()}`);
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
		    if (user) loadMessages(true);
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
		  }, [user?.id, orgId, search, directionFilter]);

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
    const direction = normalizeSmsDirection(message.direction, message.from_number, ownedDigits);
    return direction === directionFilter;
  });

	  const summary = useMemo(() => {
    const inbound = filteredMessages.filter((message) => normalizeSmsDirection(message.direction, message.from_number, ownedDigits) === 'inbound').length;
    const outbound = filteredMessages.filter((message) => normalizeSmsDirection(message.direction, message.from_number, ownedDigits) === 'outbound').length;
    const unknown = filteredMessages.length - inbound - outbound;
    return { inbound, outbound, unknown };
	  }, [filteredMessages, ownedDigits]);

  const tableRows = useMemo(() => filteredMessages.slice().sort((a, b) => messageTimeValue(b) - messageTimeValue(a)), [filteredMessages]);

  const assignedNumberFor = (message: SMSMessage) => {
    const fromDigits = normalizePhoneDigits(message.from_number);
    const toDigits = normalizePhoneDigits(message.to_number);
    const owned = senderNumbers.find((row) => {
      const digits = normalizePhoneDigits(row.number);
      return digits && (digits === fromDigits || digits === toDigits);
    });
    return owned?.number || message.to_number || message.from_number || '-';
  };

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
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
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
            <SegmentedControl
              value={directionFilter}
              onChange={setDirectionFilter}
              options={(['all', 'inbound', 'outbound', 'unknown'] as const).map((value) => ({
                value,
                label: value === 'all' ? 'All' : value,
              }))}
            />
            <button onClick={() => loadMessages(true, { syncFirst: true })} disabled={loading || syncing} className="vs-button-secondary">
              {loading || syncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 7 }).map((_, index) => <LoadingSkeleton key={index} className="h-12" />)}
            </div>
          ) : tableRows.length === 0 ? (
            <EmptyStatePanel
              title={emptyCopy.title}
              description={emptyCopy.description}
            />
          ) : (
            <div className="vs-table-shell max-h-[72vh] overflow-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    {[
                      'Date/time',
                      'Direction',
                      'From',
                      'To',
                      'Assigned number',
                      'Message preview',
                      'Status',
                      ...(isPlatformAdmin ? ['Organization'] : []),
                    ].map((label) => (
                      <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {tableRows.map((message) => {
                    const direction = normalizeSmsDirection(message.direction, message.from_number, ownedDigits);
                    const inbound = direction === 'inbound';
                    const outbound = direction === 'outbound';
                    const messageOrgName = orgs.find((org) => org.id === message.org_id)?.name || message.org_id || '-';
                    return (
                      <tr key={message.id} className="hover:bg-violet-50/40">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatTime(message)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={inbound ? 'info' : outbound ? 'success' : 'neutral'}>
                            {inbound ? 'Inbound' : outbound ? 'Outbound' : 'Unknown'}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{formatPhoneNumber(message.from_number)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{formatPhoneNumber(message.to_number)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{formatPhoneNumber(assignedNumberFor(message))}</td>
                        <td className="max-w-[360px] px-4 py-3 text-slate-700">{messagePreview(message.message_text)}</td>
                        <td className="px-4 py-3">{message.status ? <StatusBadge tone="neutral">{message.status}</StatusBadge> : <span className="text-xs text-slate-500">-</span>}</td>
                        {isPlatformAdmin && <td className="px-4 py-3 text-slate-600">{messageOrgName}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {nextOffset !== null && (
                <div className="flex justify-center border-t border-slate-200 bg-white p-4">
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
              <h2 className="text-xl font-semibold text-slate-950">Send SMS</h2>
              <p className="mt-2 text-sm text-slate-600">Send an outbound SMS without leaving the dashboard.</p>
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
