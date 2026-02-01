import React, { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface AdminLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  tabs?: Array<{ id: string; label: string; icon?: string }>;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

export const AdminLayout: FC<AdminLayoutProps> = ({ 
  title, 
  subtitle, 
  children, 
  tabs,
  activeTab,
  onTabChange 
}) => {
  const navigate = useNavigate();
  const { signOut, globalRole } = useAuth();

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-950 border-r border-slate-800 overflow-y-auto">
        {/* Logo */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">VS</span>
            </div>
            <h1 className="text-xl font-bold text-white">VictorySync</h1>
          </div>
          <p className="text-xs text-slate-400 mt-2">Admin Panel</p>
        </div>

        {/* Admin Menu */}
        <nav className="p-4 space-y-2">
          <button
            onClick={() => navigate('/admin/operations')}
            className="w-full text-left px-4 py-3 rounded-lg font-medium transition-all text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          >
            Operations
          </button>
          <button
            onClick={() => navigate('/admin/billing')}
            className="w-full text-left px-4 py-3 rounded-lg font-medium transition-all text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          >
            Billing
          </button>
          <button
            onClick={() => navigate('/admin/support')}
            className="w-full text-left px-4 py-3 rounded-lg font-medium transition-all text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          >
            Support
          </button>
          <button
            onClick={() => navigate('/admin/reports')}
            className="w-full text-left px-4 py-3 rounded-lg font-medium transition-all text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          >
            Reports
          </button>
          <button
            onClick={() => navigate('/admin/recordings')}
            className="w-full text-left px-4 py-3 rounded-lg font-medium transition-all text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          >
            Recordings
          </button>
          <button
            onClick={() => navigate('/admin/sms')}
            className="w-full text-left px-4 py-3 rounded-lg font-medium transition-all text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          >
            SMS
          </button>
          <div className="h-px bg-slate-800 my-4"></div>
          <button
            onClick={() => navigate('/')}
            className="w-full text-left px-4 py-3 rounded-lg font-medium transition-all text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          >
            Dashboard
          </button>
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800 space-y-2">
          <button
            onClick={() => signOut()}
            className="w-full px-4 py-2 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition-all text-sm font-medium"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700 sticky top-0 z-40">
          <div className="px-8 py-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-white">{title}</h1>
                {subtitle && <p className="text-slate-400 mt-1">{subtitle}</p>}
              </div>
              <div className="text-right">
                <p className="text-slate-300 text-sm">Today</p>
                <p className="text-lg font-semibold text-cyan-400">{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          {tabs && tabs.length > 0 && (
            <div className="px-8 flex gap-1 border-t border-slate-700 bg-slate-900">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange?.(tab.id)}
                  className={`px-4 py-3 font-medium transition-all ${
                    activeTab === tab.id
                      ? 'text-cyan-400 border-b-2 border-cyan-400'
                      : 'text-slate-400 hover:text-slate-300 border-b-2 border-transparent'
                  }`}
                >
                  {tab.icon && <span className="mr-2">{tab.icon}</span>}
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
