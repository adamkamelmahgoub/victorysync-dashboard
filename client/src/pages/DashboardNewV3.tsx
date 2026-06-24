import React, { FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
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
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { fetchJson, getLiveAgentStatus } from '../lib/apiClient';
import { PageLayout } from '../components/PageLayout';
import { answerRate as calculateAnswerRate } from '../lib/reportingMetrics';
import { EmptyStatePanel, LoadingSkeleton, MetricStatCard } from '../components/DashboardPrimitives';

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

function isoDateDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function endOfDayIso(date: string) {
  return date.includes('T') ? date : `${date}T23:59:59.999Z`;
}

const FIVE_YEAR_DAYS = 5 * 366;
const DEFAULT_VIEW_DAYS = 7;

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function callTime(row: Record<string, any>) {
  return row.started_at || row.created_at || row.timestamp || row.date_time || row.date;
}

function rowInDateRange(row: Record<string, any>, startDate: string, endDate: string) {
  const timestamp = Date.parse(String(callTime(row) || ''));
  if (!Number.isFinite(timestamp)) return false;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T23:59:59.999Z`);
  return timestamp >= start && timestamp <= end;
}

function callStatus(row: Record<string, any>) {
  return String(row.status || row.result || row.call_status || 'unknown').toLowerCase() || 'unknown';
}

function callDirection(row: Record<string, any>) {
  const raw = String(row.direction || row.current_call_direction || '').toLowerCase();
  if (raw.includes('out')) return 'Outbound';
  if (raw.includes('in')) return 'Inbound';
  if (raw.includes('internal')) return 'Internal';
  return 'Unknown';
}

function callNumber(row: Record<string, any>) {
  return String(row.business_number || row.assigned_number || row.phone_number || row.to_number || 'Unknown');
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
    <section className={`vs-surface overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 px-5 py-4">
        <div>
          {eyebrow && <div className="text-[11px] font-bold uppercase text-violet-700">{eyebrow}</div>}
          <h2 className="mt-1 text-base font-bold text-slate-950">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const DashboardNewV3: FC = () => {
  const navigate = useNavigate();
  const { selectedOrgId, globalRole, user, orgs } = useAuth();
  const isAdmin = globalRole === 'platform_admin';
  const activeOrgId = useMemo(() => (isAdmin ? selectedOrgId : (selectedOrgId || orgs[0]?.id || null)), [isAdmin, orgs, selectedOrgId]);
  const orgName = selectedOrgId ? orgs.find((org) => org.id === selectedOrgId)?.name || 'Selected organization' : 'All organizations';
  const { metrics, loading, error } = useDashboardMetrics(activeOrgId);
  const [liveAgents, setLiveAgents] = useState<LiveAgentStatus[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveRefreshedAt, setLiveRefreshedAt] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(isoDateDaysAgo(DEFAULT_VIEW_DAYS));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportOverview, setReportOverview] = useState<Record<string, any>>({});
  const [reportCalls, setReportCalls] = useState<Array<Record<string, any>>>([]);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);
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

  const loadReportSnapshot = useCallback(async () => {
    if (!user?.id) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const query = new URLSearchParams();
      const callsQuery = new URLSearchParams();
      if (activeOrgId) query.set('org_id', activeOrgId);
      if (activeOrgId) callsQuery.set('org_id', activeOrgId);
      if (startDate) query.set('start_date', startDate);
      callsQuery.set('start_date', isoDateDaysAgo(FIVE_YEAR_DAYS));
      if (endDate) query.set('end_date', endDate);
      if (endDate) callsQuery.set('end_date', endDate);
      const headers = { 'x-user-id': user.id };
      let overviewJson: any = {};
      let callsJson: any = {};
      let reportsError: Error | null = null;
      try {
        [overviewJson, callsJson] = await Promise.all([
          fetchJson(`/api/reports/overview?${query.toString()}`, { headers }),
          fetchJson(`/api/reports/calls?${callsQuery.toString()}&limit=5000`, { headers }),
        ]);
      } catch (err: any) {
        reportsError = err;
      }

      let overview = overviewJson.overview || {};
      let calls = callsJson.calls || [];
      if (reportsError || calls.length === 0 || Number(overview.total_calls || 0) === 0) {
        const targetOrgIds = activeOrgId ? [activeOrgId] : (isAdmin ? orgs.map((item) => item.id).filter(Boolean) : []);
        const legacy = await Promise.all(targetOrgIds.map(async (orgId) => {
          const q = new URLSearchParams();
          q.set('org_id', orgId);
          q.set('start_date', isoDateDaysAgo(FIVE_YEAR_DAYS));
          if (endDate) q.set('end_date', endOfDayIso(endDate));
          const data = await fetchJson(`/api/call-stats?${q.toString()}`, { headers });
          return {
            stats: data.stats || {},
            calls: (data.calls || []).map((row: any) => ({
              ...row,
              org_id: row.org_id || orgId,
              started_at: row.started_at || row.recording_date || row.created_at,
              duration_seconds: row.duration_seconds ?? row.duration ?? 0,
              status: row.status || 'answered',
            })),
          };
        }));
        const legacyCalls = legacy.flatMap((item) => item.calls);
        if (legacyCalls.length > 0) {
          calls = legacyCalls;
          overview = {
            ...overview,
            total_calls: legacy.reduce((sum, item) => sum + Number(item.stats.totalCalls || item.calls.length || 0), 0),
            answered_calls: legacy.reduce((sum, item) => sum + Number(item.stats.answeredCalls || 0), 0),
            missed_calls: legacy.reduce((sum, item) => sum + Number(item.stats.missedCalls || 0), 0),
            avg_duration_seconds: legacyCalls.length
              ? Math.round(legacy.reduce((sum, item) => sum + Number(item.stats.totalDuration || 0), 0) / legacyCalls.length)
              : 0,
            total_recordings: legacyCalls.filter((row: any) => row.recording_url || row.recording_id || row.has_recording).length,
          };
          reportsError = null;
        }
      }
      if (reportsError) throw reportsError;
      setReportOverview(overview);
      setReportCalls(calls);
    } catch (error: any) {
      setReportError(error?.message || 'Failed to load dashboard report data');
    } finally {
      setReportLoading(false);
    }
  }, [activeOrgId, endDate, isAdmin, orgs, startDate, user?.id]);

  useEffect(() => {
    void loadReportSnapshot();
  }, [loadReportSnapshot]);

  const answered = safeNumber(reportOverview.answered_calls ?? metrics?.answered_calls_today);
  const total = safeNumber(reportOverview.total_calls ?? metrics?.total_calls_today);
  const missed = safeNumber(reportOverview.missed_calls ?? Math.max(total - answered, 0));
  const transfers = safeNumber(reportOverview.total_transfers);
  const recordings = safeNumber(reportOverview.total_recordings);
  const sms = safeNumber(reportOverview.total_sms);
  const avgDuration = safeNumber(reportOverview.avg_duration_seconds);
  const answerRate = calculateAnswerRate(answered, total);
  const onCall = liveAgents.filter(isAgentOnCall).length;
  const available = Math.max(liveAgents.length - onCall, 0);

  const topAgents = useMemo(() => liveAgents.slice(0, 6), [liveAgents]);
  const visibleReportCalls = useMemo(
    () => reportCalls.filter((row) => rowInDateRange(row, startDate, endDate)),
    [endDate, reportCalls, startDate]
  );

  const callsByHour = useMemo(() => {
    const buckets = new Map<string, number>();
    visibleReportCalls.forEach((row) => {
      const date = new Date(callTime(row));
      if (Number.isNaN(date.getTime())) return;
      const label = `${String(date.getHours()).padStart(2, '0')}:00`;
      buckets.set(label, (buckets.get(label) || 0) + 1);
    });
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => ({ name, value }));
  }, [visibleReportCalls]);

  const callsByStatus = useMemo(() => {
    const buckets = new Map<string, number>();
    visibleReportCalls.forEach((row) => {
      const key = callStatus(row);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    return Array.from(buckets.entries()).map(([name, value]) => ({ name, value }));
  }, [visibleReportCalls]);

  const callsByNumber = useMemo(() => {
    const buckets = new Map<string, number>();
    visibleReportCalls.forEach((row) => {
      const key = callNumber(row);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    return Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [visibleReportCalls]);

  const directionBreakdown = useMemo(() => {
    const buckets = new Map<string, number>();
    visibleReportCalls.forEach((row) => {
      const key = callDirection(row);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    return Array.from(buckets.entries()).map(([name, value]) => ({ name, value }));
  }, [visibleReportCalls]);

  const agentActivity = useMemo(() => {
    return (reportOverview.top_agents || [])
      .slice(0, 8)
      .map((row: any) => ({ name: row.label || row.agent_name || row.extension || row.key || 'Agent', value: safeNumber(row.count || row.total_calls || row.total_activity) }));
  }, [reportOverview.top_agents]);

  return (
    <PageLayout
      title="Operations Command"
      description="A live operating dashboard for calls, coverage, and response quality."
      meta={(
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <span className="text-slate-500">Workspace</span>
          <span className="ml-2 font-semibold text-slate-950">{orgName}</span>
          </div>
      )}
      actions={(
        <>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="vs-input h-10 w-[150px] text-sm"
            aria-label="Overview start date"
          />
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="vs-input h-10 w-[150px] text-sm"
            aria-label="Overview end date"
          />
          <button className="vs-button-secondary" onClick={() => void loadLiveAgents(true)} disabled={liveLoading}>
            {liveLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="vs-button-secondary" onClick={() => void loadReportSnapshot()} disabled={reportLoading}>
            {reportLoading ? 'Loading...' : 'Reload Data'}
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
        {reportError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {reportError}
          </div>
        )}

        <section className="vs-surface overflow-hidden">
          <div className="grid gap-px bg-slate-200/80 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="bg-gradient-to-br from-white via-white to-violet-50/60 p-6 sm:p-8">
              <div className="text-xs font-bold uppercase text-violet-700">Today at a glance</div>
              <div className="mt-4 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div className="text-5xl font-bold text-slate-950">{answerRate}%</div>
                  <div className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                    Answer rate across {reportLoading ? 'loading' : formatNumber(total)} calls. {formatNumber(answered)} answered and {formatNumber(missed)} missed.
                  </div>
                </div>
                <div className="grid min-w-[300px] grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-sky-200 bg-white/80 p-4 shadow-sm">
                    <div className="text-xs text-slate-500">On call</div>
                    <div className="mt-2 text-2xl font-bold text-slate-950">{onCall}</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-white/80 p-4 shadow-sm">
                    <div className="text-xs text-slate-500">Available</div>
                    <div className="mt-2 text-2xl font-bold text-slate-950">{available}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 p-6 sm:p-7">
              <div className="text-xs font-bold uppercase text-violet-700">System state</div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <span className="text-sm text-slate-600">Live status</span>
                  <span className="text-sm font-semibold text-emerald-700">{liveError ? 'Needs review' : 'Connected'}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <span className="text-sm text-slate-600">Last sync</span>
                  <span className="text-sm font-semibold text-slate-950">{formatDateTime(liveRefreshedAt)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <span className="text-sm text-slate-600">Tracked numbers</span>
                  <span className="text-sm font-semibold text-slate-950">{metrics?.assignedPhones?.length || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricStatCard label="Total calls" value={formatNumber(total)} hint="All calls returned by the reports API for this date range." accent="cyan" icon="TC" loading={reportLoading} />
          <MetricStatCard label="Answered calls" value={formatNumber(answered)} hint="Connected or completed call outcomes from report data." accent="emerald" icon="AN" loading={reportLoading} />
          <MetricStatCard label="Missed calls" value={formatNumber(missed)} hint="Missed, failed, or unanswered outcomes in scope." accent="amber" icon="MS" loading={reportLoading} />
          <MetricStatCard label="Transfers" value={formatNumber(transfers)} hint="Transfer rows or transfer metadata from call records." accent="violet" icon="TR" loading={reportLoading} />
          <MetricStatCard label="Average handle time" value={formatSeconds(avgDuration)} hint="Average call duration calculated from report records." accent="cyan" icon="AH" loading={reportLoading} />
          <MetricStatCard label="Answer rate" value={`${answerRate}%`} hint={`${formatNumber(answered)} answered out of ${formatNumber(total)} total calls.`} accent="emerald" icon="AR" loading={reportLoading} unavailable={!reportLoading && total === 0} />
          <MetricStatCard label="SMS count" value={formatNumber(sms)} hint="Inbound and outbound SMS messages from the reports overview." accent="neutral" icon="SM" loading={reportLoading} />
          <MetricStatCard label="Recordings" value={formatNumber(recordings)} hint="Available recording records in the selected period." accent="violet" icon="RC" loading={reportLoading} />
          <MetricStatCard label="Active agents" value={formatNumber(liveAgents.length)} hint="Agents/extensions returned by the live status endpoint." accent="neutral" icon="AG" loading={liveLoading && liveAgents.length === 0} />
          <MetricStatCard label="On-call agents" value={formatNumber(onCall)} hint="Agents currently mapped to ringing, dialing, connected, or on-call states." accent="emerald" icon="OC" loading={liveLoading && liveAgents.length === 0} />
          <MetricStatCard label="Available agents" value={formatNumber(available)} hint="Live agents not currently mapped to active call states." accent="cyan" icon="AV" loading={liveLoading && liveAgents.length === 0} />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.55fr,0.95fr]">
          <Panel title="Calls By Hour" eyebrow="Report data">
            <div className="h-[360px] p-5">
              {reportLoading ? (
                <LoadingSkeleton className="h-full rounded-xl" />
              ) : callsByHour.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center text-sm text-slate-600">
                  No hourly call data is available for this date range yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={callsByHour} margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#374151" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#374151" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#111827', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }} />
                    <Bar dataKey="value" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>

          <Panel title="Calls By Status" eyebrow="Breakdown">
            <div className="p-5">
              {reportLoading ? (
                <LoadingSkeleton className="h-64 rounded-xl" />
              ) : callsByStatus.length === 0 ? (
                <EmptyStatePanel title="No status data yet" description="Call status counts will appear once matching call rows are returned by the reports API." />
              ) : (
                <>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={callsByStatus}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={72}
                          outerRadius={104}
                          paddingAngle={4}
                        >
                          {callsByStatus.map((entry, index) => (
                            <Cell key={`status-${index}`} fill={['#7c3aed', '#20c7b6', '#ff8a1d', '#0f6fa6', '#ef4444'][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#111827', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 space-y-3">
                    {callsByStatus.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: ['#7c3aed', '#20c7b6', '#ff8a1d', '#0f6fa6', '#ef4444'][index % 5] }} />
                      {item.name}
                    </span>
                    <span className="font-semibold text-slate-950">{formatNumber(item.value)}</span>
                  </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Panel title="Calls By Assigned Number" eyebrow="Numbers">
            <div className="h-72 p-5">
              {reportLoading ? (
                <LoadingSkeleton className="h-full rounded-xl" />
              ) : callsByNumber.length === 0 ? (
                <EmptyStatePanel title="No number data yet" description="Assigned number breakdown appears when calls have a matching business number." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={callsByNumber} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis type="number" stroke="#374151" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={100} stroke="#374151" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#111827', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }} />
                    <Bar dataKey="value" fill="#0f6fa6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>

          <Panel title="Call Direction Breakdown" eyebrow="Direction">
            <div className="h-72 p-5">
              {reportLoading ? (
                <LoadingSkeleton className="h-full rounded-xl" />
              ) : directionBreakdown.length === 0 ? (
                <EmptyStatePanel title="No direction data yet" description="Inbound and outbound counts appear when call direction is returned by the reports API." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={directionBreakdown} dataKey="value" nameKey="name" innerRadius={64} outerRadius={96} paddingAngle={4}>
                      {directionBreakdown.map((entry, index) => (
                        <Cell key={`direction-${entry.name}`} fill={['#20c7b6', '#7c3aed', '#ff8a1d', '#94a3b8'][index % 4]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#111827', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>

          <Panel title="Agent Activity" eyebrow="Agents">
            <div className="h-72 p-5">
              {reportLoading ? (
                <LoadingSkeleton className="h-full rounded-xl" />
              ) : agentActivity.length === 0 ? (
                <EmptyStatePanel title="No agent activity yet" description="Agent activity appears when calls, recordings, or SMS can be mapped to an agent or extension." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentActivity} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis type="number" stroke="#374151" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={100} stroke="#374151" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#111827', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }} />
                    <Bar dataKey="value" fill="#20c7b6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr,1fr]">
          <Panel
            title="Live Floor"
            eyebrow="Agents"
            action={<button className="vs-button-secondary" onClick={() => navigate('/live-status')}>Open</button>}
          >
            <div className="divide-y divide-slate-100">
              {liveError && <div className="px-5 py-4 text-sm text-orange-300">{liveError}</div>}
              {topAgents.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">{liveLoading ? 'Loading live agents...' : 'No live agents returned yet.'}</div>
              ) : topAgents.map((agent) => {
                const active = isAgentOnCall(agent);
                return (
                  <div key={agent.user_id} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-violet-50/50">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-950">{agent.display_name || agent.email || 'Agent'}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {agent.email || 'No email'}{agent.extension ? ` - Ext ${agent.extension}` : ''}
                      </div>
                    </div>
                    <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
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
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md active:translate-y-0"
                >
                  <div className="text-sm font-semibold text-slate-950">{title}</div>
                  <div className="mt-1 text-sm text-slate-500">{description}</div>
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
