import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getLiveAgentStatus, refreshLiveAgentStatus } from '../lib/apiClient';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, LoadingSkeleton, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { formatPhoneNumber, normalizeLivePresenceStatus, type LivePresenceStatus } from '../lib/reportingMetrics';

type LiveAgentStatus = {
  user_id: string;
  org_id?: string | null;
  email?: string | null;
  extension?: string | null;
  display_name?: string | null;
  on_call: boolean;
  counterpart?: string | null;
  status?: string | null;
  normalized_status?: string | null;
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
  stale?: boolean;
  evidence_age_ms?: number | null;
  decision_reason?: string | null;
  current_call_id?: string | null;
};

function fmtDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

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

function statusKey(agent: LiveAgentStatus): LivePresenceStatus {
  return normalizeLivePresenceStatus(
    agent.normalized_status || agent.status || agent.raw_status,
    agent.on_call,
    agent.stale,
  );
}

function isAgentOnCall(agent: LiveAgentStatus) {
  const status = statusKey(agent);
  return agent.on_call || status === 'ringing' || status === 'on_call';
}

function refreshedAgeMs(agent: LiveAgentStatus, nowMs = Date.now()) {
  const raw = agent.refreshed_at || agent.last_seen_at;
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(nowMs - parsed, 0);
}

function isFresh(agent: LiveAgentStatus, nowMs = Date.now()) {
  return refreshedAgeMs(agent, nowMs) < 30_000;
}

function isStale(agent: LiveAgentStatus, nowMs = Date.now()) {
  return refreshedAgeMs(agent, nowMs) > 60_000;
}

function liveDuration(agent: LiveAgentStatus, nowMs: number) {
  const startedAt = agent.answered_at || agent.started_at;
  const byTimestamp = fmtDurationFrom(startedAt, nowMs);
  if (byTimestamp !== '00:00') return byTimestamp;
  if (typeof agent.evidence_age_ms === 'number' && Number.isFinite(agent.evidence_age_ms) && agent.evidence_age_ms > 0) {
    return fmtDurationFrom(new Date(nowMs - agent.evidence_age_ms).toISOString(), nowMs);
  }
  return '00:00';
}

function statusVisuals(agent: LiveAgentStatus): {
  badgeTone: 'neutral' | 'success' | 'warning' | 'info';
  cardClass: string;
  label: string;
} {
  switch (statusKey(agent)) {
    case 'available':
      return { badgeTone: 'success', cardClass: 'border-emerald-400/25 bg-emerald-400/[0.03]', label: 'Available' };
    case 'ringing':
      return { badgeTone: 'warning', cardClass: 'border-amber-400/25 bg-amber-400/[0.035]', label: 'Ringing' };
    case 'on_call':
      return { badgeTone: 'info', cardClass: 'border-cyan-400/25 bg-cyan-400/[0.035]', label: 'On call' };
    case 'offline':
      return { badgeTone: 'neutral', cardClass: 'border-slate-500/20 bg-white/[0.018]', label: 'Offline' };
    default:
      return { badgeTone: 'neutral', cardClass: 'border-white/[0.04] bg-white/[0.025]', label: 'Unknown' };
  }
}

function stableAgentKey(agent: LiveAgentStatus) {
  return `${agent.org_id || 'global'}:${agent.extension || agent.user_id || agent.email || 'agent'}`;
}

function mergeLiveRows(previous: LiveAgentStatus[], incoming: LiveAgentStatus[]) {
  const previousByKey = new Map(previous.map((agent) => [stableAgentKey(agent), agent]));
  return incoming.map((next) => {
    const prior = previousByKey.get(stableAgentKey(next));
    if (!prior) return next;
    const nextStatus = statusKey(next);
    const priorStatus = statusKey(prior);
    const keepPriorActiveMomentarily =
      (priorStatus === 'ringing' || priorStatus === 'on_call') &&
      nextStatus === 'unknown' &&
      isFresh(prior);
    return keepPriorActiveMomentarily ? { ...next, ...prior, refreshed_at: next.refreshed_at || prior.refreshed_at } : { ...prior, ...next };
  });
}

const LiveStatusPage: FC = () => {
  const { user, globalRole, orgs, selectedOrgId, setSelectedOrgId } = useAuth();
  const isAdmin = globalRole === 'platform_admin';
  const activeOrgId = isAdmin ? selectedOrgId : (selectedOrgId || orgs[0]?.id || null);

  const [items, setItems] = useState<LiveAgentStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const itemsRef = useRef<LiveAgentStatus[]>([]);
  const inFlight = useRef(false);
  const lastStartedAt = useRef(0);
  const seq = useRef(0);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const load = useCallback(async (showInitialLoader = false) => {
    if (!user?.id) return;
    if (inFlight.current && Date.now() - lastStartedAt.current < 10_000) return;
    inFlight.current = true;
    lastStartedAt.current = Date.now();
    const requestSeq = ++seq.current;
    if (showInitialLoader || itemsRef.current.length === 0) setLoading(true);
    setError(null);
    try {
      const json = await getLiveAgentStatus({ orgId: activeOrgId }, user.id);
      if (requestSeq !== seq.current) return;
      setItems(mergeLiveRows(itemsRef.current, (json.items || []) as LiveAgentStatus[]));
      setRefreshedAt(json.refreshed_at || new Date().toISOString());
    } catch (err: any) {
      if (requestSeq === seq.current) setError(err?.message || 'Failed to load live agent status');
    } finally {
      inFlight.current = false;
      if (requestSeq === seq.current) setLoading(false);
    }
  }, [activeOrgId, user?.id]);

  useEffect(() => {
    void load(true);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(false);
    }, 5_000);
    return () => window.clearInterval(intervalId);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const forceSync = async () => {
    if (!user?.id) return;
    setSyncing(true);
    setError(null);
    try {
      const result = await refreshLiveAgentStatus(activeOrgId, user.id);
      if (Array.isArray(result?.items)) {
        setItems(mergeLiveRows(itemsRef.current, result.items as LiveAgentStatus[]));
        setRefreshedAt(result.refreshed_at || new Date().toISOString());
      } else {
        await load(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to force live refresh');
    } finally {
      setSyncing(false);
    }
  };

  const orgNameById = new Map(orgs.map((org) => [org.id, org.name]));
  const counts = useMemo(() => {
    const byStatus: Record<LivePresenceStatus, number> = { available: 0, ringing: 0, on_call: 0, offline: 0, unknown: 0 };
    for (const item of items) byStatus[statusKey(item)] += 1;
    return byStatus;
  }, [items]);
  const staleItems = items.filter((agent) => !isAgentOnCall(agent) && (agent.stale || isStale(agent, nowMs)));

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {isAdmin && (
        <select
          value={selectedOrgId ?? ''}
          onChange={(event) => setSelectedOrgId(event.target.value || null)}
          className="vs-input min-w-[220px]"
          aria-label="Organization"
        >
          <option value="">All organizations</option>
          {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
        </select>
      )}
      <div className="flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/[0.08] px-3 py-1 text-xs font-semibold text-cyan-200">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
        MightyCall API polling
      </div>
      {loading && items.length > 0 && (
        <div className="rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-3 py-1 text-xs font-semibold text-emerald-300">
          Refreshing
        </div>
      )}
      <button onClick={() => load(false)} disabled={loading} className="vs-button-secondary">
        {loading ? 'Refreshing...' : 'Refresh'}
      </button>
      <button onClick={forceSync} disabled={syncing} className="vs-button-secondary">
        {syncing ? 'Syncing...' : 'Force sync'}
      </button>
    </div>
  );

  const meta = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.045] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Live roster</div>
        <div className="mt-2 text-sm font-medium text-slate-200">{counts.on_call} on call - {counts.ringing} ringing</div>
      </div>
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.045] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Updated</div>
        <div className="mt-2 text-sm font-medium text-slate-200">{refreshedAt ? fmtDateTime(refreshedAt) : 'Waiting for first sync'}</div>
      </div>
    </div>
  );

  return (
    <PageLayout
      eyebrow="Live monitoring"
      title="Live status"
      description="API-polled MightyCall extension presence without webhook dependency or refresh flicker."
      actions={actions}
      meta={meta}
    >
      <div className="space-y-6">
        {error && <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{error}</div>}
        {staleItems.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {staleItems.length} extension{staleItems.length === 1 ? '' : 's'} have stale API evidence. Last known state remains visible until MightyCall returns a fresher status.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <MetricStatCard label="Available" value={counts.available} accent="emerald" />
          <MetricStatCard label="Ringing" value={counts.ringing} accent="amber" />
          <MetricStatCard label="On call" value={counts.on_call} accent="cyan" />
          <MetricStatCard label="Offline" value={counts.offline} />
          <MetricStatCard label="Unknown" value={counts.unknown} />
        </div>

        <SectionCard title="Extension roster" description="Mapped by MightyCall extension when available, with active ringing/on-call states preserved during background refresh.">
          {loading && items.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => <LoadingSkeleton key={index} className="h-48" />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyStatePanel
              title="No live roster activity found"
              description="No MightyCall extension presence was returned for this scope. Confirm agents have assigned MightyCall extensions and the org integration is configured."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {items.map((agent) => {
                const visuals = statusVisuals(agent);
                const active = isAgentOnCall(agent);
                const counterpart = agent.counterpart || (agent.direction === 'outbound' ? agent.to_number : agent.from_number);
                return (
                  <article key={stableAgentKey(agent)} className={`rounded-lg border p-5 shadow-[0_14px_34px_rgba(2,6,23,0.14)] ${visuals.cardClass}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-white">{agent.display_name || agent.email || `Extension ${agent.extension || '-'}`}</div>
                        <div className="mt-1 text-sm text-slate-400">
                          {agent.email || 'No email'}
                          {agent.extension ? ` - Ext ${agent.extension}` : ''}
                          {isAdmin && agent.org_id ? ` - ${orgNameById.get(agent.org_id) || agent.org_id}` : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={visuals.badgeTone}>{visuals.label}</StatusBadge>
                        {isFresh(agent, nowMs) && !isStale(agent, nowMs) && (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-xs font-semibold text-emerald-200">Fresh</span>
                        )}
                        {isStale(agent, nowMs) && (
                          <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-3 py-1 text-xs font-semibold text-amber-200">Stale</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="vs-surface-muted p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Current call</div>
                        <div className="mt-3 break-words text-sm text-slate-200">{active ? formatPhoneNumber(counterpart) : 'Not on a call'}</div>
                        <div className="mt-2 text-xs text-slate-500">{active ? `${agent.direction || 'unknown'} - ${liveDuration(agent, nowMs)}` : 'No active call evidence'}</div>
                        <div className="mt-2 text-xs text-slate-500">Call ID: {agent.current_call_id || '-'}</div>
                      </div>
                      <div className="vs-surface-muted p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">API evidence</div>
                        <div className="mt-3 text-sm text-slate-200">Started {active ? fmtDateTime(agent.started_at || agent.answered_at) : '-'}</div>
                        <div className="mt-2 text-xs text-slate-500">Raw: {agent.raw_status || agent.status || '-'}</div>
                        <div className="mt-1 text-xs text-slate-500">Source: {agent.api_source || agent.source || '-'}</div>
                        <div className="mt-1 text-xs text-slate-500">Decision: {agent.decision_reason || '-'}</div>
                        <div className="mt-1 text-xs text-slate-500">Refreshed {fmtDateTime(agent.refreshed_at)}</div>
                      </div>
                    </div>
                  </article>
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
