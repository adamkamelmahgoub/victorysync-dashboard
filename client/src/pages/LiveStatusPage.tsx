import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getLiveAgentStatus } from '../lib/apiClient';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, LoadingSkeleton, SectionCard, StatusBadge } from '../components/DashboardPrimitives';

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
  source?: string | null;
  raw_status?: string | null;
};

function fmtDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

const LiveStatusPage: FC = () => {
  const { user, globalRole, orgs, selectedOrgId, setSelectedOrgId } = useAuth();
  const isAdmin = globalRole === 'platform_admin';
  const [items, setItems] = useState<LiveAgentStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const liveRequestSeq = useRef(0);
  const liveRequestInFlight = useRef(false);

  const activeOrgId = isAdmin ? selectedOrgId : (selectedOrgId || orgs[0]?.id || null);

  const load = async () => {
    if (!user?.id) return;
    if (liveRequestInFlight.current) return;
    liveRequestInFlight.current = true;
    const requestSeq = ++liveRequestSeq.current;
    try {
      setLoading(true);
      setError(null);
      const json = await getLiveAgentStatus({ orgId: activeOrgId }, user.id);
      if (requestSeq !== liveRequestSeq.current) return;
      setItems((json.items || []) as LiveAgentStatus[]);
      setRefreshedAt(json.refreshed_at || new Date().toISOString());
    } catch (e: any) {
      if (requestSeq !== liveRequestSeq.current) return;
      setError(e?.message || 'Failed to load live agent status');
    } finally {
      liveRequestInFlight.current = false;
      if (requestSeq === liveRequestSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const intervalId = window.setInterval(load, 1000);
    const onFocus = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('visibilitychange', onFocus);
    };
  }, [user?.id, activeOrgId]);

  const orgNameById = new Map(orgs.map((org) => [org.id, org.name]));
  const onCall = items.filter((agent) => agent.on_call).length;
  const idle = Math.max(items.length - onCall, 0);

  const actions = useMemo(() => (
    <div className="flex flex-wrap items-center gap-2">
      {isAdmin && (
        <select
          value={selectedOrgId ?? ''}
          onChange={(e) => setSelectedOrgId(e.target.value || null)}
          className="vs-input min-w-[220px]"
        >
          <option value="">All organizations</option>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
      )}
      <button onClick={load} disabled={loading} className="vs-button-secondary">
        {loading ? 'Refreshing live...' : 'Refresh Live'}
      </button>
    </div>
  ), [isAdmin, loading, orgs, selectedOrgId, setSelectedOrgId]);

  const meta = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-white/[0.03] bg-white/[0.03] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Live roster</div>
        <div className="mt-2 text-sm font-medium text-slate-200">{onCall} on call - {idle} available</div>
      </div>
      <div className="rounded-2xl border border-white/[0.03] bg-white/[0.03] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Updated</div>
        <div className="mt-2 text-sm font-medium text-slate-200">{refreshedAt ? fmtDateTime(refreshedAt) : 'Waiting for first sync'}</div>
      </div>
    </div>
  );

  return (
    <PageLayout
      eyebrow="Live monitoring"
      title="Live status"
      description="Monitor current call activity, agent availability, and active counterparts across the operation."
      actions={actions}
      meta={meta}
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {error}
          </div>
        )}

        <SectionCard title="Real-time roster" description="Live agent presence from MightyCall, grouped for quick operational scanning.">
          {loading && items.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <LoadingSkeleton key={idx} className="h-48" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyStatePanel
              title="No live roster activity found"
              description="VictorySync did not receive any current agent call presence for the selected scope. Try refreshing or narrowing to one organization."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {items.map((agent) => (
                <div key={`${agent.org_id || 'global'}:${agent.user_id}`} className="rounded-3xl border border-white/[0.03] bg-white/[0.025] p-5 shadow-[0_14px_34px_rgba(2,6,23,0.14)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-base font-semibold text-white">{agent.display_name || agent.email || 'Agent'}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {agent.email || 'No email'}
                        {agent.extension ? ` · Ext ${agent.extension}` : ''}
                        {isAdmin && agent.org_id ? ` · ${orgNameById.get(agent.org_id) || agent.org_id}` : ''}
                      </div>
                    </div>
                    <StatusBadge tone={agent.on_call ? 'success' : 'neutral'}>
                      {agent.on_call ? 'On Call' : (agent.status || 'Idle')}
                    </StatusBadge>
                  </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="vs-surface-muted p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">With</div>
                        <div className="mt-3 break-words text-sm text-slate-200">{agent.on_call ? (agent.counterpart || 'Unknown number') : 'Not on a call'}</div>
                      </div>
                    <div className="vs-surface-muted p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Started</div>
                        <div className="mt-3 text-sm text-slate-200">{agent.on_call ? fmtDateTime(agent.started_at) : '-'}</div>
                        <div className="mt-2 text-xs text-slate-500">{agent.status || (agent.on_call ? 'On Call' : 'Idle')}</div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </SectionCard>
      </div>
    </PageLayout>
  );
};

export default LiveStatusPage;
