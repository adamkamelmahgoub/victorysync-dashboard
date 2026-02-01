import React, { FC, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// KPI Card Component
const KPICard: FC<{ title: string; value: string | number; change?: string; trend?: 'up' | 'down'; icon?: React.ReactNode }> = ({ title, value, change, trend, icon }) => {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 hover:border-cyan-500 transition-all">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-white mt-2">{value}</p>
          {change && (
            <p className={`text-sm mt-2 ${trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
              {trend === 'up' ? '↑' : '↓'} {change}
            </p>
          )}
        </div>
        {icon && <div className="text-cyan-500 text-2xl">{icon}</div>}
      </div>
    </div>
  );
};

// Navigation Component
const Sidebar: FC<{ isAdmin: boolean; navigate: any; currentPath: string }> = ({ isAdmin, navigate, currentPath }) => {
  const { signOut } = useAuth();
  
  const menuItems = isAdmin ? [
    { label: 'Dashboard', icon: '📊', path: '/' },
    { label: 'Phone Numbers', icon: '☎️', path: '/numbers' },
    { label: 'Reports', icon: '📈', path: '/admin/reports' },
    { label: 'Recordings', icon: '🎙️', path: '/admin/recordings' },
    { label: 'SMS Messages', icon: '💬', path: '/admin/sms' },
    { label: 'Support Tickets', icon: '🎟️', path: '/admin/support' },
    { label: 'Billing', icon: '💳', path: '/admin/billing' },
    { label: 'Admin Settings', icon: '⚙️', path: '/admin/operations' },
  ] : [
    { label: 'Dashboard', icon: '📊', path: '/' },
    { label: 'Phone Numbers', icon: '☎️', path: '/numbers' },
    { label: 'Reports', icon: '📈', path: '/reports' },
    { label: 'Recordings', icon: '🎙️', path: '/recordings' },
    { label: 'SMS', icon: '💬', path: '/sms' },
    { label: 'Support', icon: '🎟️', path: '/support' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-slate-950 border-r border-slate-800 overflow-y-auto">
      {/* Logo Section */}
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg p-2 text-white">🔷</span>
          VictorySync
        </h1>
      </div>

      {/* Menu Items */}
      <nav className="p-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all ${
              currentPath === item.path
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/50'
                : 'text-slate-300 hover:bg-slate-800 hover:text-cyan-400'
            }`}
          >
            <span className="mr-3">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800">
        <button
          onClick={() => signOut()}
          className="w-full px-4 py-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition-all text-sm font-medium"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
};

// Main Dashboard Component
export const DashboardV2: FC = () => {
  const navigate = useNavigate();
  const { selectedOrgId, user, globalRole } = useAuth();
  const isAdmin = globalRole === 'platform_admin';
  const { metrics, loading } = useDashboardMetrics(selectedOrgId ?? null);
  const [currentPath, setCurrentPath] = useState('/');

  // Mock data for charts
  const callsTrendData = [
    { name: 'Mon', calls: 240, answered: 200 },
    { name: 'Tue', calls: 290, answered: 250 },
    { name: 'Wed', calls: 350, answered: 320 },
    { name: 'Thu', calls: 420, answered: 380 },
    { name: 'Fri', calls: 530, answered: 490 },
    { name: 'Sat', calls: 280, answered: 240 },
    { name: 'Sun', calls: 190, answered: 160 },
  ];

  const smsData = [
    { name: 'Inbound', value: 35, fill: '#06b6d4' },
    { name: 'Outbound', value: 65, fill: '#0ea5e9' },
  ];

  useEffect(() => {
    setCurrentPath(window.location.pathname);
  }, []);

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      {/* Sidebar */}
      <Sidebar isAdmin={isAdmin} navigate={navigate} currentPath={currentPath} />

      {/* Main Content */}
      <main className="ml-64 flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700 sticky top-0 z-40">
          <div className="px-8 py-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                <p className="text-slate-400 mt-1">Welcome back! Here's your performance overview</p>
              </div>
              <div className="text-right">
                <p className="text-slate-300 text-sm">Today</p>
                <p className="text-lg font-semibold text-cyan-400">{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-8">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-cyan-500 mx-auto mb-4"></div>
                <p className="text-slate-400">Loading metrics...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* KPI Section */}
              <div>
                <h2 className="text-xl font-bold text-white mb-4">Key Performance Indicators</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <KPICard
                    title="Total Calls"
                    value={metrics?.total_calls_today || 0}
                    change="12.5%"
                    trend="up"
                    icon="☎️"
                  />
                  <KPICard
                    title="Answered Calls"
                    value={metrics?.answered_calls_today || 0}
                    change="8.3%"
                    trend="up"
                    icon="✓"
                  />
                  <KPICard
                    title="Answer Rate"
                    value={metrics?.answer_rate_today ? Math.round(metrics.answer_rate_today) + '%' : '0%'}
                    change="2.1%"
                    trend="down"
                    icon="⏱️"
                  />
                  <KPICard
                    title="Avg Wait"
                    value={metrics?.avg_wait_seconds_today ? Math.round(metrics.avg_wait_seconds_today) + 's' : '0s'}
                    change="5.4%"
                    trend="up"
                    icon="💬"
                  />
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calls Trend Chart */}
                <div className="lg:col-span-2 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold text-white mb-4">Weekly Call Volume</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={callsTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="calls" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4' }} />
                      <Line type="monotone" dataKey="answered" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* SMS Distribution */}
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold text-white mb-4">SMS Distribution</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={smsData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }: any) => `${name}: ${value}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {smsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                        <div>
                          <p className="text-sm font-medium">Incoming Call</p>
                          <p className="text-xs text-slate-400">+1 (555) 123-456{i}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-300">2m ago</p>
                        <p className="text-xs text-slate-400">4m 32s</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default DashboardV2;
