import React, { FC, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { Sidebar } from "../components/Sidebar";
import { getOrgAgentLiveStatus } from "../lib/apiClient";

type LiveAgentStatus = {
  user_id: string;
  email?: string | null;
  extension?: string | null;
  display_name?: string | null;
  on_call: boolean;
  counterpart?: string | null;
  status?: string | null;
  started_at?: string | null;
};

const DashboardNewV3: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedOrgId, globalRole, user } = useAuth();
  const isAdmin = globalRole === 'platform_admin';
  const { metrics, loading } = useDashboardMetrics(selectedOrgId ?? null);
  const [liveAgents, setLiveAgents] = useState<LiveAgentStatus[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveRefreshedAt, setLiveRefreshedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadLiveAgents = async () => {
      if (!selectedOrgId || !user?.id) {
        if (!cancelled) {
          setLiveAgents([]);
          setLiveError(null);
          setLiveRefreshedAt(null);
        }
        return;
      }

      try {
        if (!cancelled) {
          setLiveLoading(true);
          setLiveError(null);
        }
        const json = await getOrgAgentLiveStatus(selectedOrgId, user.id);
        if (cancelled) return;
        setLiveAgents((json.items || []) as LiveAgentStatus[]);
        setLiveRefreshedAt(json.refreshed_at || new Date().toISOString());
      } catch (e: any) {
        if (cancelled) return;
        setLiveError(e?.message || "Failed to load live agent status");
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    };

    loadLiveAgents();
    const intervalId = window.setInterval(loadLiveAgents, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedOrgId, user?.id]);

  const formatSecondsAsMinutes = (s: number | undefined | null) => {
    if (!s && s !== 0) return '0m 0s';
    const secs = Math.round(s || 0);
    const m = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${m}m ${sec}s`;
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  return (
    <div className="flex min-h-screen text-white">
      <Sidebar isAdmin={isAdmin} currentPath={location.pathname} />

      {/* Main Content */}
      <main className="ml-64 flex-1 overflow-auto">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/75 backdrop-blur">
          <div className="px-8 py-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                <p className="text-slate-400 text-sm mt-1">Welcome back to VictorySync</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-sm">Today</p>
                <p className="text-lg font-semibold text-cyan-300">{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-8">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-slate-400">Loading dashboard...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* KPI Grid */}
              <div>
                <h2 className="text-xl font-bold text-white mb-6">Key Metrics</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <MetricCard
                    label="Total Calls"
                    value={metrics?.total_calls_today || 0}
                    color="blue"
                  />
                  <MetricCard
                    label="Answered Calls"
                    value={metrics?.answered_calls_today || 0}
                    color="green"
                  />
                  <MetricCard
                    label="Answer Rate"
                    value={`${Math.round(metrics?.answer_rate_today || 0)}%`}
                    color="cyan"
                  />
                  <MetricCard
                    label="Avg Wait Time"
                    value={formatSecondsAsMinutes(metrics?.avg_wait_seconds_today)}
                    color="cyan"
                  />
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h2 className="text-xl font-bold text-white mb-6">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <ActionCard
                    title="Phone Numbers"
                    description="Manage your phone numbers"
                    onClick={() => navigate('/numbers')}
                  />
                  <ActionCard
                    title="Reports"
                    description="View call reports and analytics"
                    onClick={() => navigate(isAdmin ? '/admin/reports' : '/reports')}
                  />
                  <ActionCard
                    title="Support"
                    description="Contact support or submit tickets"
                    onClick={() => navigate(isAdmin ? '/admin/support' : '/support')}
                  />
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Live Agent Status</h2>
                    <p className="text-sm text-slate-400 mt-1">
                      {selectedOrgId
                        ? (liveRefreshedAt ? `Updated ${formatDateTime(liveRefreshedAt)}` : 'Status from MightyCall')
                        : 'Select an organization to view live agent call status'}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!selectedOrgId || !user?.id) return;
                      try {
                        setLiveLoading(true);
                        setLiveError(null);
                        const json = await getOrgAgentLiveStatus(selectedOrgId, user.id);
                        setLiveAgents((json.items || []) as LiveAgentStatus[]);
                        setLiveRefreshedAt(json.refreshed_at || new Date().toISOString());
                      } catch (e: any) {
                        setLiveError(e?.message || "Failed to load live agent status");
                      } finally {
                        setLiveLoading(false);
                      }
                    }}
                    disabled={!selectedOrgId || liveLoading}
                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-cyan-500 hover:text-cyan-300 disabled:opacity-50"
                  >
                    {liveLoading ? 'Refreshing...' : 'Refresh Live'}
                  </button>
                </div>

                {liveError && (
                  <div className="mb-4 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
                    {liveError}
                  </div>
                )}

                {!selectedOrgId ? (
                  <div className="text-sm text-slate-400">No organization selected.</div>
                ) : liveAgents.length === 0 ? (
                  <div className="text-sm text-slate-400">
                    {liveLoading ? 'Loading live agent activity...' : 'No agents or live call activity found for this organization.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {liveAgents.map((agent) => (
                      <div key={agent.user_id} className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-white font-semibold">
                              {agent.display_name || agent.email || 'Agent'}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              {agent.email || 'No email'}{agent.extension ? ` • Ext ${agent.extension}` : ''}
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
                            <div className="mt-1 text-xs text-slate-500">Started {formatDateTime(agent.started_at)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                <h2 className="text-lg font-bold text-white mb-4">System Status</h2>
                <div className="space-y-3">
                  <StatusItem label="API Server" status="operational" />
                  <StatusItem label="Database" status="operational" />
                  <StatusItem label="Phone Service" status={metrics ? "operational" : "checking"} />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

interface MetricCardProps {
  label: string;
  value: string | number;
  color: 'blue' | 'green' | 'cyan' | 'purple';
}

const MetricCard: FC<MetricCardProps> = ({ label, value, color }) => {
  const colorMap = {
    blue: 'from-blue-600 to-blue-700',
    green: 'from-green-600 to-green-700',
    cyan: 'from-cyan-600 to-cyan-700',
    purple: 'from-purple-600 to-purple-700',
  };

  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} rounded-lg p-6 border border-slate-600`}>
      <p className="text-slate-200 text-sm font-medium">{label}</p>
      <p className="text-4xl font-bold text-white mt-3">{value}</p>
    </div>
  );
};

interface ActionCardProps {
  title: string;
  description: string;
  onClick: () => void;
}

const ActionCard: FC<ActionCardProps> = ({ title, description, onClick }) => (
  <button
    onClick={onClick}
    className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-blue-500 hover:bg-slate-700 transition-all text-left"
  >
    <h3 className="text-lg font-bold text-white">{title}</h3>
    <p className="text-slate-400 text-sm mt-2">{description}</p>
  </button>
);

interface StatusItemProps {
  label: string;
  status: 'operational' | 'checking' | 'error';
}

const StatusItem: FC<StatusItemProps> = ({ label, status }) => {
  const statusColor = status === 'operational' ? 'text-green-400' : status === 'checking' ? 'text-yellow-400' : 'text-red-400';
  const statusText = status === 'operational' ? 'Operational' : status === 'checking' ? 'Checking...' : 'Error';
  
  return (
    <div className="flex items-center justify-between p-3 bg-slate-700 rounded">
      <p className="text-white font-medium">{label}</p>
      <p className={`text-sm font-semibold ${statusColor}`}>{statusText}</p>
    </div>
  );
};

export default DashboardNewV3;
