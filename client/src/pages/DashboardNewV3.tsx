import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { getLiveAgentStatus } from '../lib/apiClient';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, LoadingSkeleton, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';

type LiveAgentStatus = {
  user_id: string;
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

type WorkflowCardProps = {
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
};

function formatSecondsAsMinutes(s: number | undefined | null) {
  if (!s && s !== 0) return '0m 0s';
  const secs = Math.round(s || 0);
  const m = Math.floor(secs / 60);
  const sec = secs % 60;
  return `${m}m ${sec}s`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

const WorkflowCard: FC<WorkflowCardProps> = ({ title, description, actionLabel, onClick }) => (
  <button
    onClick={onClick}
    className="flex h-full flex-col justify-between rounded-3xl border border-white/8 bg-white/[0.025] p-5 text-left transition hover:border-cyan-400/20 hover:bg-white/[0.045]"
  >
    <div>
      <div className="text-sm font-semibold text-white">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
    <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/85">{actionLabel}</div>
  </button>
);

const DashboardNewV3: FC = () => {
  const navigate = useNavigate();
  const { selectedOrgId, globalRole, user, orgs } = useAuth();
  const isAdmin = globalRole === 'platform_admin';
  const { metrics, loading, error } = useDashboardMetrics(selectedOrgId ?? null);
  const [liveAgents, setLiveAgents] = useState<LiveAgentStatus[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveRefreshedAt, setLiveRefreshedAt] = useState<string | null>(null);
  const liveRequestInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const activeOrgId = isAdmin ? selectedOrgId : (selectedOrgId || orgs[0]?.id || null);

    const loadLiveAgents = async () => {
      if (liveRequestInFlight.current) return;
      if (!user?.id) {
        if (!cancelled) {
          setLiveAgents([]);
          setLiveError(null);
          setLiveRefreshedAt(null);
        }
        return;
      }

      liveRequestInFlight.current = true;
      try {
        if (!cancelled) {
          setLiveLoading(true);
          setLiveError(null);
        }
        const json = await getLiveAgentStatus({ orgId: activeOrgId }, user.id);
        if (cancelled) return;
        setLiveAgents((json.items || []) as LiveAgentStatus[]);
        setLiveRefreshedAt(json.refreshed_at || new Date().toISOString());
      } catch (e: any) {
        if (cancelled) return;
        setLiveError(e?.message || 'Failed to load live agent status');
      } finally {
        liveRequestInFlight.current = false;
        if (!cancelled) setLiveLoading(false);
      }
    };

    loadLiveAgents();
    const intervalId = window.setInterval(loadLiveAgents, 15000);
    const onFocus = () => {
      if (document.visibilityState === 'visible') loadLiveAgents();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('visibilitychange', onFocus);
    };
  }, [selectedOrgId, user?.id, isAdmin, orgs]);

  const orgName = selectedOrgId ? orgs.find((org) => org.id === selectedOrgId)?.name || 'Selected organization' : 'All organizations';
  const answered = metrics?.answered_calls_today || 0;
  const total = metrics?.total_calls_today || 0;
  const missed = Math.max(total - answered, 0);
  const onCallCount = liveAgents.filter((agent) => agent.on_call).length;
  const availableCount = Math.max(liveAgents.length - onCallCount, 0);

  const workflowCards = useMemo(() => ([
    {
      title: 'Investigate queue activity',
      description: 'Review live roster movement, answer coverage, and who is currently handling calls.',
      actionLabel: 'Open live status',
      onClick: () => navigate('/live-status'),
    },
    {
      title: 'Review reports and recordings',
      description: 'Jump into report drilldowns and recordings to trace dropped calls, missed opportunities, and QA issues.',
      actionLabel: 'Open reporting',
      onClick: () => navigate(isAdmin ? '/admin/reports' : '/reports'),
    },
    {
      title: 'Manage numbers and routing',
      description: 'Keep client phone inventory aligned with teams, assignments, and operational ownership.',
      actionLabel: 'Open numbers',
      onClick: () => navigate('/numbers'),
    },
  ]), [isAdmin, navigate]);

  const headerActions = (
    <>
      <button onClick={() => navigate('/live-status')} className="vs-button-secondary">
        Open Live Status
      </button>
      <button onClick={() => navigate(isAdmin ? '/admin/reports' : '/reports')} className="vs-button-primary">
        View Reports
      </button>
    </>
  );

  const headerMeta = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Workspace</div>
        <div className="mt-2 text-sm font-medium text-slate-200">{orgName}</div>
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Last live sync</div>
        <div className="mt-2 text-sm font-medium text-slate-200">{liveRefreshedAt ? formatDateTime(liveRefreshedAt) : 'Waiting for first refresh'}</div>
      </div>
    </div>
  );

  return (
    <PageLayout
      eyebrow="Operations overview"
      title="Executive dashboard"
      description="A high-trust view of live call performance, agent coverage, and the operational workflows your team needs most."
      actions={headerActions}
      meta={headerMeta}
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {loading ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <LoadingSkeleton key={idx} className="h-36" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr,1fr]">
              <LoadingSkeleton className="h-[360px]" />
              <LoadingSkeleton className="h-[360px]" />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricStatCard
                label="Total Calls"
                value={total}
                hint={<span>{answered} answered today</span>}
              />
              <MetricStatCard
                label="Answer Rate"
                value={`${Math.round(metrics?.answer_rate_today || 0)}%`}
                hint={<span>{metrics?.delta_pp ? `${metrics.delta_pp >= 0 ? '+' : ''}${metrics.delta_pp.toFixed(1)} pp vs baseline` : 'Monitoring against yesterday trend'}</span>}
                accent="cyan"
              />
              <MetricStatCard
                label="Avg Wait Time"
                value={formatSecondsAsMinutes(metrics?.avg_wait_seconds_today)}
                hint="Keep queue delay contained during peak hours"
                accent="amber"
              />
              <MetricStatCard
                label="Coverage"
                value={`${onCallCount}/${liveAgents.length || 0}`}
                hint={<span>{availableCount} currently available</span>}
                accent="emerald"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr,1fr]">
              <SectionCard
                title="Operational snapshot"
                description="Today’s performance in the context of client coverage and service pressure."
                className="h-full"
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Call handling</div>
                    <div className="mt-4 flex items-end justify-between gap-4">
                      <div>
                        <div className="text-3xl font-semibold tracking-[-0.03em] text-white">{answered}</div>
                        <div className="mt-1 text-sm text-slate-400">Calls answered today</div>
                      </div>
                      <StatusBadge tone={missed > 0 ? 'warning' : 'success'}>
                        {missed > 0 ? `${missed} missed` : 'No misses'}
                      </StatusBadge>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Assigned coverage</div>
                    <div className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white">{metrics?.assignedPhones?.length || 0}</div>
                    <div className="mt-1 text-sm text-slate-400">Tracked phone numbers attached to this workspace</div>
                  </div>

                  <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Live floor status</div>
                    <div className="mt-4 flex items-center gap-2">
                      <StatusBadge tone={onCallCount > 0 ? 'info' : 'neutral'}>
                        {onCallCount > 0 ? `${onCallCount} on call` : 'No active calls'}
                      </StatusBadge>
                      <StatusBadge tone="success">{availableCount} available</StatusBadge>
                    </div>
                    <div className="mt-3 text-sm text-slate-400">Active agent presence pulled from MightyCall.</div>
                  </div>

                  <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Service posture</div>
                    <div className="mt-4 text-lg font-semibold text-white">
                      {Math.round(metrics?.answer_rate_today || 0) >= 80 ? 'Healthy coverage' : 'Attention required'}
                    </div>
                    <div className="mt-2 text-sm text-slate-400">
                      {Math.round(metrics?.answer_rate_today || 0) >= 80
                        ? 'Answer performance is staying within a strong operating range.'
                        : 'Answer performance is below target and worth reviewing with the team.'}
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Priority workflows"
                description="The next places operators usually need to go from the executive view."
                className="h-full"
              >
                <div className="grid gap-4">
                  {workflowCards.map((card) => (
                    <WorkflowCard key={card.title} {...card} />
                  ))}
                </div>
              </SectionCard>
            </div>

            <SectionCard
              title="Live agent roster"
              description={selectedOrgId
                ? 'Real-time roster presence from MightyCall for the selected organization.'
                : 'Select an organization to review real-time agent activity.'}
              actions={(
                <button
                  onClick={async () => {
                    if (!selectedOrgId || !user?.id) return;
                    try {
                      setLiveLoading(true);
                      setLiveError(null);
                      const activeOrgId = isAdmin ? selectedOrgId : (selectedOrgId || orgs[0]?.id || null);
                      const json = await getLiveAgentStatus({ orgId: activeOrgId }, user.id);
                      setLiveAgents((json.items || []) as LiveAgentStatus[]);
                      setLiveRefreshedAt(json.refreshed_at || new Date().toISOString());
                    } catch (e: any) {
                      setLiveError(e?.message || 'Failed to load live agent status');
                    } finally {
                      setLiveLoading(false);
                    }
                  }}
                  disabled={!selectedOrgId || liveLoading}
                  className="vs-button-secondary"
                >
                  {liveLoading ? 'Refreshing live...' : 'Refresh Live'}
                </button>
              )}
            >
              {liveError && (
                <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  {liveError}
                </div>
              )}

              {!selectedOrgId ? (
                <EmptyStatePanel
                  title="No organization selected"
                  description="Choose an organization from the workspace selector to load live agent activity and call coverage."
                />
              ) : liveAgents.length === 0 ? (
                <EmptyStatePanel
                  title={liveLoading ? 'Loading live activity' : 'No live roster activity yet'}
                  description={liveLoading
                    ? 'VictorySync is polling MightyCall for current call presence and agent availability.'
                    : 'No agents or live call activity were returned for this organization yet.'}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {liveAgents.map((agent) => (
                    <div key={agent.user_id} className="rounded-3xl border border-white/8 bg-white/[0.025] p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-base font-semibold text-white">{agent.display_name || agent.email || 'Agent'}</div>
                          <div className="mt-1 text-sm text-slate-400">
                            {agent.email || 'No email'}
                            {agent.extension ? ` - Ext ${agent.extension}` : ''}
                          </div>
                        </div>
                        <StatusBadge tone={agent.on_call ? 'success' : 'neutral'}>
                          {agent.on_call ? 'On Call' : (agent.status || 'Idle')}
                        </StatusBadge>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="vs-surface-muted p-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Counterpart</div>
                          <div className="mt-3 text-sm text-slate-200 break-words">{agent.on_call ? (agent.counterpart || 'Unknown number') : 'Not on a call'}</div>
                        </div>
                        <div className="vs-surface-muted p-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Call state</div>
                          <div className="mt-3 text-sm text-slate-200">{agent.status || (agent.on_call ? 'On Call' : 'Idle')}</div>
                          <div className="mt-2 text-xs text-slate-500">Started {agent.on_call ? formatDateTime(agent.started_at) : '-'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Service health" description="High-level platform posture for day-to-day operating confidence.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="vs-surface-muted p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200">API Server</span>
                    <StatusBadge tone="success">Operational</StatusBadge>
                  </div>
                  <p className="mt-3 text-sm text-slate-400">Dashboard APIs are responding and current metrics were retrieved successfully.</p>
                </div>
                <div className="vs-surface-muted p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200">MightyCall sync</span>
                    <StatusBadge tone={liveError ? 'warning' : 'info'}>{liveError ? 'Review' : 'Connected'}</StatusBadge>
                  </div>
                  <p className="mt-3 text-sm text-slate-400">Live roster and imported extensions depend on MightyCall presence data.</p>
                </div>
                <div className="vs-surface-muted p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200">Coverage watch</span>
                    <StatusBadge tone={missed > 0 ? 'warning' : 'success'}>{missed > 0 ? 'Needs review' : 'Stable'}</StatusBadge>
                  </div>
                  <p className="mt-3 text-sm text-slate-400">Use live roster and reports together to investigate missed-call windows quickly.</p>
                </div>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default DashboardNewV3;
