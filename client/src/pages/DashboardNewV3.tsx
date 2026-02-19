import React, { FC } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { Sidebar } from "../components/Sidebar";

const DashboardNewV3: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedOrgId, globalRole } = useAuth();
  const isAdmin = globalRole === 'platform_admin';
  const { metrics, loading } = useDashboardMetrics(selectedOrgId ?? null);

  const formatSecondsAsMinutes = (s: number | undefined | null) => {
    if (!s && s !== 0) return '0m 0s';
    const secs = Math.round(s || 0);
    const m = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${m}m ${sec}s`;
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
