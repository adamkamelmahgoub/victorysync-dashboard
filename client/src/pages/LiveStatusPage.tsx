import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getLiveAgentStatus, refreshLiveAgentStatus } from '../lib/apiClient';
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
  direction?: string | null;
  from_number?: string | null;
  to_number?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  started_at?: string | null;
  source?: string | null;
  raw_status?: string | null;
  api_source?: string | null;
  last_seen_at?: string | null;
  refreshed_at?: string | null;
  stale_after?: string | null;
  stale?: boolean;
};

function fmtDurationFrom(startAt?: string | null, nowMs = Date.now()) {
  if (!startAt) return '00:00';
  const startMs = Date.parse(startAt);
  if (Number.isNaN(startMs)) return '00:00';
  const total = Math.max(Math.floor((nowMs - startMs) / 1000), 0);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return hh > 0
    ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

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
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());
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
    const intervalId = window.setInterval(load, 2000);
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

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const orgNameById = new Map(orgs.map((org) => [org.id, org.name]));
  const onCall = items.filter((agent) => agent.on_call).length;
  const idle = Math.max(items.length - onCall, 0);
  const staleItems = items.filter((agent) => agent.stale);

  const forceSync = async () => {
    if (!user?.id) return;
    try {
      setSyncing(true);
      await refreshLiveAgentStatus(activeOrgId, user.id);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to force live refresh');
    } finally {
      setSyncing(false);
    }
  };

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
      <button onClick={forceSync} disabled={syncing} className="vs-button-secondary">
        {syncing ? 'Syncing now...' : 'Force Sync'}
      </button>
    </div>
  ), [forceSync, isAdmin, loading, orgs, selectedOrgId, setSelectedOrgId, syncing]);

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
        {staleItems.length > 0 && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Live status cache is stale for {staleItems.length} agent{staleItems.length === 1 ? '' : 's'}. The page is showing the last known state, not confirmed current presence.
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
                        {agent.extension ? ` - Ext ${agent.extension}` : ''}
                        {isAdmin && agent.org_id ? ` - ${orgNameById.get(agent.org_id) || agent.org_id}` : ''}
                      </div>
                    </div>
                    <StatusBadge tone={agent.stale ? 'warning' : agent.on_call ? 'success' : 'neutral'}>
                      {agent.stale ? 'Stale' : agent.on_call ? 'On Call' : (agent.status || 'Idle')}
                    </StatusBadge>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="vs-surface-muted p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">With</div>
                      <div className="mt-3 break-words text-sm text-slate-200">{agent.on_call ? (agent.counterpart || 'Unknown number') : 'Not on a call'}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        {agent.direction ? `${agent.direction === 'outbound' ? 'Outbound' : 'Incoming'}${agent.from_number || agent.to_number ? ' - ' : ''}` : ''}
                        {agent.direction === 'outbound' ? (agent.to_number || '') : (agent.from_number || '')}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">Raw status: {agent.raw_status || '-'}</div>
                      <div className="mt-1 text-xs text-slate-500">API source: {agent.api_source || agent.source || '-'}</div>
                      <div className="mt-2 text-xs text-slate-500">Last seen {fmtDateTime(agent.last_seen_at)}</div>
                    </div>
                    <div className="vs-surface-muted p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Started</div>
                      <div className="mt-3 text-sm text-slate-200">{agent.on_call ? fmtDateTime(agent.started_at) : '-'}</div>
                      {agent.on_call && (
                        <div className="mt-2 text-xs font-semibold text-emerald-300">Live duration {fmtDurationFrom(agent.answered_at || agent.started_at, nowMs)}</div>
                      )}
                      <div className="mt-2 text-xs text-slate-500">{agent.status || (agent.on_call ? 'On Call' : 'Idle')}</div>
                      <div className="mt-2 text-xs text-slate-500">Refreshed {fmtDateTime(agent.refreshed_at)}</div>
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

