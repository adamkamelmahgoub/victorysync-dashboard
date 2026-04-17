import React, { FC, useEffect, useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { getLiveAgentStatus } from '../lib/apiClient';

type LiveAgentStatus = {
  user_id: string;
  org_id?: string | null;
  email?: string | null;
  extension?: string | null;
  display_name?: string | null;
  on_call: boolean;
  counterpart?: string | null;
  status?: string | null;
  started_at?: string | null;
};

function fmtDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

const LiveStatusPage: FC = () => {
  const location = useLocation();
  const { user, globalRole, orgs, selectedOrgId, setSelectedOrgId } = useAuth();
  const isAdmin = globalRole === 'platform_admin';
  const [items, setItems] = useState<LiveAgentStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const activeOrgId = isAdmin ? selectedOrgId : (selectedOrgId || orgs[0]?.id || null);

  const load = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      setError(null);
      const json = await getLiveAgentStatus({ orgId: activeOrgId }, user.id);
      setItems((json.items || []) as LiveAgentStatus[]);
      setRefreshedAt(json.refreshed_at || new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || 'Failed to load live agent status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const intervalId = window.setInterval(load, 30000);
    return () => window.clearInterval(intervalId);
  }, [user?.id, activeOrgId]);

  const orgNameById = new Map(orgs.map((org) => [org.id, org.name]));

  return (
    <div className="flex min-h-screen text-white">
      <Sidebar isAdmin={isAdmin} currentPath={location.pathname} />

      <main className="ml-64 flex-1 overflow-auto">
        <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/75 backdrop-blur">
          <div className="px-8 py-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Live Status</h1>
              <p className="text-slate-400 text-sm mt-1">
                {refreshedAt ? `Updated ${fmtDateTime(refreshedAt)}` : 'Live agent status from MightyCall'}
              </p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              {isAdmin && (
                <select
                  value={selectedOrgId ?? ''}
                  onChange={(e) => setSelectedOrgId(e.target.value || null)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="">All organizations</option>
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={load}
                disabled={loading}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-cyan-500 hover:text-cyan-300 disabled:opacity-50"
              >
                {loading ? 'Refreshing...' : 'Refresh Live'}
              </button>
            </div>
          </div>
        </header>

        <div className="p-8">
          {error && (
            <div className="mb-6 rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
              {error}
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="text-sm text-slate-400">Loading live agent activity...</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-slate-400">No agents or live call activity found.</div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {items.map((agent) => (
                <div key={`${agent.org_id || 'global'}:${agent.user_id}`} className="rounded-lg border border-slate-700 bg-slate-900/50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-white font-semibold">
                        {agent.display_name || agent.email || 'Agent'}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {agent.email || 'No email'}
                        {agent.extension ? ` • Ext ${agent.extension}` : ''}
                        {isAdmin && agent.org_id ? ` • ${orgNameById.get(agent.org_id) || agent.org_id}` : ''}
                      </div>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      agent.on_call ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-700 text-slate-300'
                    }`}>
                      {agent.on_call ? 'On Call' : (agent.status || 'Idle')}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md bg-slate-800/80 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">With</div>
                      <div className="mt-1 text-slate-200 break-words">{agent.counterpart || '-'}</div>
                    </div>
                    <div className="rounded-md bg-slate-800/80 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Status</div>
                      <div className="mt-1 text-slate-200">{agent.status || (agent.on_call ? 'On Call' : 'Idle')}</div>
                      <div className="mt-1 text-xs text-slate-500">Started {fmtDateTime(agent.started_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default LiveStatusPage;
