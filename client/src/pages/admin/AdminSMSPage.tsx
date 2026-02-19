import React, { FC, useEffect, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';

interface SMSMessage {
  id: string;
  org_id: string;
  from_number?: string | null;
  to_number?: string | null;
  message_text?: string | null;
  direction?: 'inbound' | 'outbound' | string;
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

  useEffect(() => {
    fetchOrgs();
  }, []);

  useEffect(() => {
    loadMessages(true);
  }, [filterOrgId, filterDirection, userId]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const interval = setInterval(() => {
      loadMessages(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefreshEnabled, filterOrgId, filterDirection, userId]);

  const fetchOrgs = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/admin/orgs'), {
        headers: {
          'x-user-id': userId || '',
          'x-dev-bypass': 'true'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setOrgs(data.orgs || []);
      }
    } catch (error) {
      console.error('Error fetching orgs:', error);
    }
  };

  const loadMessages = async (reset = false) => {
    const activeOffset = reset ? 0 : (nextOffset ?? 0);
    if (!userId) return;
    if (!reset && nextOffset == null) return;

    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      let url = buildApiUrl(`/api/sms/messages?limit=${PAGE_SIZE}&offset=${activeOffset}`);
      if (filterOrgId) {
        url += `&org_id=${encodeURIComponent(filterOrgId)}`;
      }

      const response = await fetch(url, {
        headers: {
          'x-user-id': userId,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch messages');
        return;
      }

      const data = await response.json();
      let rows: SMSMessage[] = data.messages || [];
      if (filterDirection) {
        rows = rows.filter((m: SMSMessage) => (m.direction || '').toLowerCase() === filterDirection);
      }

      setMessages((prev) => (reset ? rows : [...prev, ...rows]));
      setNextOffset(data.next_offset ?? null);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  const truncateMessage = (text: string, length = 120) => {
    if ((text || '').length <= length) return text || '';
    return `${text.substring(0, length)}...`;
  };

  const formatTime = (m: SMSMessage) => {
    const raw = m.created_at || m.message_date || m.sent_at;
    return raw ? new Date(raw).toLocaleString() : '-';
  };

  return (
    <PageLayout title="SMS Messages" description="View and manage SMS messages across all organizations">
      <div className="space-y-6">
        <AdminTopNav />

        <div className="bg-slate-900/80 ring-1 ring-slate-800 p-6 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Filters</h2>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 text-cyan-500"
              />
              Auto-refresh (5s)
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Organization</label>
              <select
                value={filterOrgId}
                onChange={(e) => setFilterOrgId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-50 text-sm"
              >
                <option value="">All Organizations</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Direction</label>
              <select
                value={filterDirection}
                onChange={(e) => setFilterDirection(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-50 text-sm"
              >
                <option value="">All Directions</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 ring-1 ring-slate-800 p-6 rounded-lg">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Messages ({messages.length})</h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 mb-2"></div>
              <div className="text-slate-400 text-sm">Loading messages...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">No messages found</div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700/50">
                    <tr className="text-slate-400">
                      <th className="text-left py-3 px-4 font-semibold">Organization</th>
                      <th className="text-left py-3 px-4 font-semibold">From / To</th>
                      <th className="text-left py-3 px-4 font-semibold">Message</th>
                      <th className="text-left py-3 px-4 font-semibold">Direction</th>
                      <th className="text-left py-3 px-4 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {messages.map((message) => (
                      <tr key={message.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 text-slate-200">{message.organizations?.name || message.org_id}</td>
                        <td className="py-3 px-4 text-slate-300 font-mono text-xs">
                          {(message.from_number || '-') + ' -> ' + (message.to_number || '-')}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-xs">{truncateMessage(message.message_text || '')}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                            (message.direction || '').toLowerCase() === 'inbound'
                              ? 'bg-blue-900/50 text-blue-200 ring-1 ring-blue-800/50'
                              : 'bg-emerald-900/50 text-emerald-200 ring-1 ring-emerald-800/50'
                          }`}>
                            {(message.direction || 'unknown').toString()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{formatTime(message)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nextOffset !== null && (
                <div className="flex justify-center">
                  <button
                    onClick={() => loadMessages(false)}
                    disabled={loadingMore}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 text-sm hover:bg-slate-700 disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading more...' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default AdminSMSPage;
