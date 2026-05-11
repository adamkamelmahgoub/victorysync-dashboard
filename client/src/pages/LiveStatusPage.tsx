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
  evidence_age_ms?: number | null;
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

function fmtDurationFromSeconds(totalSeconds: number) {
  const total = Math.max(Math.floor(totalSeconds), 0);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return hh > 0
    ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function getLiveDuration(agent: LiveAgentStatus, nowMs: number) {
  const byStartTime = fmtDurationFrom(agent.answered_at || agent.started_at, nowMs);
  if (byStartTime !== '00:00') return byStartTime;
  if (typeof agent.evidence_age_ms === 'number' && Number.isFinite(agent.evidence_age_ms) && agent.evidence_age_ms > 0) {
    return fmtDurationFromSeconds(agent.evidence_age_ms / 1000);
  }
  return byStartTime;
}

function normalizedStatus(agent: LiveAgentStatus) {
  const raw = String(agent.status || agent.raw_status || '').toLowerCase();
  if (agent.stale || isStale(agent)) return 'stale';
  if (raw.includes('dnd') || raw.includes('disturb')) return 'dnd';
  if (raw.includes('offline')) return 'offline';
  if (raw.includes('ring')) return 'ringing';
  if (raw.includes('dial')) return 'dialing';
  if (agent.on_call || raw.includes('call') || raw.includes('connect') || raw.includes('talk')) return 'on_call';
  if (raw.includes('wrap')) return 'wrap_up';
  if (raw.includes('available') || raw.includes('idle') || raw.includes('ready')) return 'available';
  return 'unknown';
}

function refreshedAgeMs(agent: LiveAgentStatus, nowMs = Date.now()) {
  const raw = agent.refreshed_at || agent.last_seen_at;
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(nowMs - parsed, 0);
}

function isFresh(agent: LiveAgentStatus, nowMs = Date.now()) {
  return refreshedAgeMs(agent, nowMs) < 30000;
}

function isStale(agent: LiveAgentStatus, nowMs = Date.now()) {
  return refreshedAgeMs(agent, nowMs) > 60000;
}

function statusVisuals(agent: LiveAgentStatus): {
  badgeTone: 'neutral' | 'success' | 'warning' | 'info';
  cardClass: string;
  label: string;
} {
  switch (normalizedStatus(agent)) {
    case 'stale':
      return { badgeTone: 'warning', cardClass: 'border-amber-400/25 bg-amber-400/[0.035]', label: 'Stale' };
    case 'ringing':
      return { badgeTone: 'warning', cardClass: 'border-amber-400/25 bg-amber-400/[0.035]', label: 'Ringing' };
    case 'dialing':
      return { badgeTone: 'info', cardClass: 'border-cyan-400/25 bg-cyan-400/[0.035]', label: 'Dialing' };
    case 'on_call':
      return { badgeTone: 'info', cardClass: 'border-cyan-400/25 bg-cyan-400/[0.035]', label: 'On Call' };
    case 'available':
      return { badgeTone: 'success', cardClass: 'border-emerald-400/25 bg-emerald-400/[0.03]', label: 'Available' };
    case 'dnd':
      return { badgeTone: 'warning', cardClass: 'border-rose-400/25 bg-rose-400/[0.035]', label: 'DND' };
    case 'offline':
      return { badgeTone: 'neutral', cardClass: 'border-slate-500/20 bg-white/[0.018]', label: 'Offline' };
    case 'wrap_up':
      return { badgeTone: 'warning', cardClass: 'border-violet-400/20 bg-violet-400/[0.03]', label: 'Wrap Up' };
    default:
      return { badgeTone: 'neutral', cardClass: 'border-white/[0.03] bg-white/[0.025]', label: agent.status || 'Unknown' };
  }
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
	    const intervalId = window.setInterval(() => {
	      if (document.visibilityState === 'visible') load();
	    }, 5000);
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
	  const staleItems = items.filter((agent) => agent.stale || isStale(agent, nowMs));

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
              {items.map((agent) => {
                const visuals = statusVisuals(agent);
                return (
                  <div key={`${agent.org_id || 'global'}:${agent.user_id}`} className={`rounded-3xl border p-5 shadow-[0_14px_34px_rgba(2,6,23,0.14)] ${visuals.cardClass}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-base font-semibold text-white">{agent.display_name || agent.email || 'Agent'}</div>
                        <div className="mt-1 text-sm text-slate-400">
                          {agent.email || 'No email'}
                          {agent.extension ? ` - Ext ${agent.extension}` : ''}
                          {isAdmin && agent.org_id ? ` - ${orgNameById.get(agent.org_id) || agent.org_id}` : ''}
                        </div>
                      </div>
	                      <StatusBadge tone={visuals.badgeTone}>
	                        {visuals.label}
	                      </StatusBadge>
	                      {isFresh(agent, nowMs) && !isStale(agent, nowMs) && (
	                        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-xs font-semibold text-emerald-200">
	                          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
	                          Live
	                        </div>
	                      )}
	                      {isStale(agent, nowMs) && (
	                        <div className="rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-3 py-1 text-xs font-semibold text-amber-200">
	                          Stale
	                        </div>
	                      )}
	                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="vs-surface-muted p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">With</div>
                        <div className="mt-3 break-words text-sm text-slate-200">{agent.on_call ? (agent.counterpart || 'Unknown number') : 'Not on a call'}</div>
                        <div className="mt-2 text-xs text-slate-500">
                          {agent.on_call
                            ? `${agent.direction ? `${agent.direction === 'outbound' ? 'Outbound' : 'Incoming'}${agent.from_number || agent.to_number ? ' - ' : ''}` : ''}${agent.direction === 'outbound' ? (agent.to_number || '') : (agent.from_number || '')}`
                            : ''}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">Raw status: {agent.raw_status || '-'}</div>
                        <div className="mt-1 text-xs text-slate-500">API source: {agent.api_source || agent.source || '-'}</div>
                        <div className="mt-2 text-xs text-slate-500">Last seen {fmtDateTime(agent.last_seen_at)}</div>
                      </div>
                      <div className="vs-surface-muted p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Started</div>
                        <div className="mt-3 text-sm text-slate-200">{agent.on_call ? fmtDateTime(agent.started_at) : '-'}</div>
                        {agent.on_call && (
                          <div className="mt-2 text-xs font-semibold text-emerald-300">Live duration {getLiveDuration(agent, nowMs)}</div>
                        )}
                        <div className="mt-2 text-xs text-slate-500">{agent.status || (agent.on_call ? 'On Call' : 'Idle')}</div>
                        <div className="mt-2 text-xs text-slate-500">Refreshed {fmtDateTime(agent.refreshed_at)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </PageLayout>
  );
};

export default LiveStatusPage;
