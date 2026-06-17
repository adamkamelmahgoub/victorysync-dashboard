import React, { FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useCallSeries } from '../hooks/useCallSeries';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { getLiveAgentStatus } from '../lib/apiClient';
import { PageLayout } from '../components/PageLayout';
import { answerRate as calculateAnswerRate } from '../lib/reportingMetrics';

type LiveAgentStatus = {
  user_id: string;
  email?: string | null;
  extension?: string | null;
  display_name?: string | null;
  on_call: boolean;
  counterpart?: string | null;
  status?: string | null;
  normalized_status?: string | null;
  direction?: string | null;
  started_at?: string | null;
};

function isAgentOnCall(agent: LiveAgentStatus) {
  const status = String(agent.normalized_status || agent.status || '').toLowerCase();
  return agent.on_call || ['on_call', 'on call', 'ring', 'dial', 'hold', 'transfer', 'connect', 'talk'].some((token) => status.includes(token));
}

function formatSeconds(value?: number | null) {
  const seconds = Math.max(0, Math.round(value || 0));
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not synced yet';
  return date.toLocaleString();
}

function Panel({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.055] shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
        <div>
          {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-200/80">{eyebrow}</div>}
          <h2 className="mt-1 text-base font-semibold text-white">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone: 'blue' | 'teal' | 'orange' | 'violet';
}) {
  const tones = {
    blue: 'bg-cyan-400/12 text-cyan-200',
    teal: 'bg-emerald-400/12 text-emerald-200',
    orange: 'bg-amber-400/12 text-amber-200',
    violet: 'bg-violet-400/14 text-violet-100',
  };

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.055] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[#aab2bd]">{label}</div>
          <div className="mt-5 text-3xl font-semibold leading-none text-white">{value}</div>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${tones[tone]}`}>
          {tone === 'blue' ? 'A' : tone === 'teal' ? 'L' : tone === 'orange' ? 'W' : 'C'}
        </div>
      </div>
      <div className="mt-4 text-sm text-slate-400">{detail}</div>
    </div>
  );
}

const DashboardNewV3: FC = () => {
  const navigate = useNavigate();
  const { selectedOrgId, globalRole, user, orgs } = useAuth();
  const isAdmin = globalRole === 'platform_admin';
  const activeOrgId = useMemo(() => (isAdmin ? selectedOrgId : (selectedOrgId || orgs[0]?.id || null)), [isAdmin, orgs, selectedOrgId]);
  const orgName = selectedOrgId ? orgs.find((org) => org.id === selectedOrgId)?.name || 'Selected organization' : 'All organizations';
  const { metrics, loading, error } = useDashboardMetrics(activeOrgId);
  const { points, loading: trendLoading } = useCallSeries(activeOrgId, 'month');
  const [liveAgents, setLiveAgents] = useState<LiveAgentStatus[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveRefreshedAt, setLiveRefreshedAt] = useState<string | null>(null);
  const requestInFlight = useRef(false);

  const loadLiveAgents = useCallback(async (force = false) => {
    if (!user?.id || requestInFlight.current) return;
    requestInFlight.current = true;
    setLiveLoading(force || liveAgents.length === 0);
    setLiveError(null);
    try {
      const json = await getLiveAgentStatus({ orgId: activeOrgId }, user.id);
      setLiveAgents((json.items || []) as LiveAgentStatus[]);
      setLiveRefreshedAt(json.refreshed_at || new Date().toISOString());
    } catch (e: any) {
      setLiveError(e?.message || 'Failed to load live status');
    } finally {
      requestInFlight.current = false;
      setLiveLoading(false);
    }
  }, [activeOrgId, liveAgents.length, user?.id]);

  useEffect(() => {
    void loadLiveAgents();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadLiveAgents();
    }, 10000);
    return () => window.clearInterval(id);
  }, [loadLiveAgents]);

  const answered = metrics?.answered_calls_today || 0;
  const total = metrics?.total_calls_today || 0;
  const missed = Math.max(total - answered, 0);
  const answerRate = metrics?.answer_rate_today != null
    ? Math.round(metrics.answer_rate_today)
    : calculateAnswerRate(answered, total);
  const onCall = liveAgents.filter(isAgentOnCall).length;
  const available = Math.max(liveAgents.length - onCall, 0);

  const trendData = useMemo(() => {
    if (points.length) {
      return points.map((point) => ({
        label: point.bucketLabel.length > 8 ? point.bucketLabel.slice(5, 10) : point.bucketLabel,
        total: point.totalCalls || 0,
        answered: point.answered || 0,
        missed: point.missed || 0,
      }));
    }
    return [];
  }, [points]);

  const mixData = useMemo(() => ([
    { name: 'Answered', value: answered, color: '#20c7b6' },
    { name: 'Missed', value: missed, color: '#ff8a1d' },
    { name: 'On call', value: onCall, color: '#7c3aed' },
  ]).filter((item) => item.value > 0), [answered, missed, onCall]);

  const topAgents = useMemo(() => liveAgents.slice(0, 6), [liveAgents]);

  return (
    <PageLayout
      title="Operations Command"
      description="A live operating dashboard for calls, coverage, and response quality."
      meta={(
        <div className="rounded-xl border border-[#2c3138] bg-[#15171b] px-4 py-3 text-sm text-[#aab2bd]">
          <span className="text-slate-500">Workspace</span>
          <span className="ml-2 font-semibold text-white">{orgName}</span>
        </div>
      )}
      actions={(
        <>
          <button className="vs-button-secondary" onClick={() => void loadLiveAgents(true)} disabled={liveLoading}>
            {liveLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="vs-button-primary" onClick={() => navigate('/live-status')}>
            Live Floor
          </button>
        </>
      )}
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-lg border border-violet-300/16 bg-white/[0.055] shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="grid gap-px bg-white/[0.08] lg:grid-cols-[1.2fr,0.8fr]">
            <div className="bg-[#0b1020]/72 p-6 sm:p-7">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200/80">Today at a glance</div>
              <div className="mt-4 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div className="text-5xl font-semibold tracking-tight text-white">{answerRate}%</div>
                  <div className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                    Answer rate across {formatNumber(total)} calls. {formatNumber(answered)} answered and {formatNumber(missed)} missed.
                  </div>
                </div>
                <div className="grid min-w-[300px] grid-cols-2 gap-3">
                  <div className="rounded-lg border border-cyan-300/12 bg-cyan-400/[0.06] p-4">
                    <div className="text-xs text-slate-400">On call</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{onCall}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-300/12 bg-emerald-400/[0.06] p-4">
                    <div className="text-xs text-slate-400">Available</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{available}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-[#0f172a]/70 p-6 sm:p-7">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200/80">System state</div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.045] px-4 py-3">
                  <span className="text-sm text-slate-300">Live status</span>
                  <span className="text-sm font-semibold text-emerald-200">{liveError ? 'Needs review' : 'Connected'}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.045] px-4 py-3">
                  <span className="text-sm text-slate-300">Last sync</span>
                  <span className="text-sm font-semibold text-white">{formatDateTime(liveRefreshedAt)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.045] px-4 py-3">
                  <span className="text-sm text-slate-300">Tracked numbers</span>
                  <span className="text-sm font-semibold text-white">{metrics?.assignedPhones?.length || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total calls" value={loading ? '...' : formatNumber(total)} detail={`${formatNumber(answered)} answered`} tone="blue" />
          <MetricCard label="Live agents" value={loading ? '...' : formatNumber(liveAgents.length)} detail={`${formatNumber(onCall)} currently on call`} tone="teal" />
          <MetricCard label="Avg wait" value={loading ? '...' : formatSeconds(metrics?.avg_wait_seconds_today)} detail="Current queue pressure" tone="orange" />
          <MetricCard label="Coverage" value={`${onCall}/${liveAgents.length || 0}`} detail={`${formatNumber(available)} available now`} tone="violet" />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.55fr,0.95fr]">
          <Panel title="Call Volume" eyebrow="Trend">
            <div className="h-[360px] p-5">
              {trendLoading ? (
                <div className="h-full animate-pulse rounded-xl bg-white/[0.04]" />
              ) : trendData.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center text-sm text-slate-600">
                  No call volume series is available for this date range yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="callsGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#0f6fa6" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#0f6fa6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#111827', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }} />
                    <Area type="monotone" dataKey="total" stroke="#0f6fa6" strokeWidth={3} fill="url(#callsGradient)" />
                    <Area type="monotone" dataKey="answered" stroke="#20c7b6" strokeWidth={2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>

          <Panel title="Response Mix" eyebrow="Breakdown">
            <div className="p-5">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mixData.length ? mixData : [{ name: 'No data', value: 1, color: '#e2e8f0' }]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={72}
                      outerRadius={104}
                      paddingAngle={4}
                    >
                      {(mixData.length ? mixData : [{ color: '#e2e8f0' }]).map((entry, index) => (
                        <Cell key={`mix-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#111827', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-3">
                {(mixData.length ? mixData : [{ name: 'No data', value: 0, color: '#858d99' }]).map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-[#aab2bd]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                      {item.name}
                    </span>
                    <span className="font-semibold text-white">{formatNumber(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr,1fr]">
          <Panel
            title="Live Floor"
            eyebrow="Agents"
            action={<button className="vs-button-secondary" onClick={() => navigate('/live-status')}>Open</button>}
          >
            <div className="divide-y divide-[#262b31]">
              {liveError && <div className="px-5 py-4 text-sm text-orange-300">{liveError}</div>}
              {topAgents.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-[#858d99]">{liveLoading ? 'Loading live agents...' : 'No live agents returned yet.'}</div>
              ) : topAgents.map((agent) => {
                const active = isAgentOnCall(agent);
                return (
                  <div key={agent.user_id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{agent.display_name || agent.email || 'Agent'}</div>
                      <div className="mt-1 truncate text-xs text-[#858d99]">
                        {agent.email || 'No email'}{agent.extension ? ` - Ext ${agent.extension}` : ''}
                      </div>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? 'bg-[#0d5d55] text-[#7af2df]' : 'bg-[#242832] text-[#aab2bd]'}`}>
                      {active ? 'On call' : (agent.status || 'Idle')}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Workflow Shortcuts" eyebrow="Actions">
            <div className="grid gap-3 p-5">
              {[
                ['Live Status', 'Monitor current agent presence and active calls.', '/live-status'],
                ['Reports', 'Review trends, recordings, and missed-call patterns.', isAdmin ? '/admin/reports' : '/reports'],
                ['Numbers', 'Manage phone inventory and routing ownership.', '/numbers'],
              ].map(([title, description, path]) => (
                <button
                  key={title}
                  onClick={() => navigate(path)}
                  className="rounded-xl border border-[#2c3138] bg-[#1b1e23] p-4 text-left transition hover:border-[#3c4652] hover:bg-[#20242b]"
                >
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <div className="mt-1 text-sm text-[#858d99]">{description}</div>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </PageLayout>
  );
};

export default DashboardNewV3;
