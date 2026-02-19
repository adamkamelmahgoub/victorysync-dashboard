import React, { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  isAdmin: boolean;
  currentPath: string;
}

export const Sidebar: FC<SidebarProps> = ({ isAdmin, currentPath }) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const adminItems = [
    { label: 'Dashboard', path: '/' },
    { label: 'Phone Numbers', path: '/numbers' },
    { label: 'Invite Codes', path: '/admin/invites' },
    { label: 'Reports', path: '/admin/reports' },
    { label: 'Recordings', path: '/admin/recordings' },
    { label: 'SMS', path: '/admin/sms' },
    { label: 'Support', path: '/admin/support' },
    { label: 'Billing', path: '/admin/billing' },
    { label: 'Operations', path: '/admin/operations' },
  ];

  const clientItems = [
    { label: 'Dashboard', path: '/' },
    { label: 'Phone Numbers', path: '/numbers' },
    { label: 'Reports', path: '/reports' },
    { label: 'Recordings', path: '/recordings' },
    { label: 'SMS', path: '/sms' },
    { label: 'Support', path: '/support' },
  ];

  const menuItems = isAdmin ? adminItems : clientItems;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-950/90 border-r border-slate-800 backdrop-blur flex flex-col">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-900/40">
            <span className="text-white font-bold text-sm">VS</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">VictorySync</h1>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Operations Hub</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all text-sm ${
              currentPath === item.path
                ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 text-white shadow-md shadow-cyan-900/30'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-cyan-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-2">
        <button
          onClick={() => navigate('/account-settings')}
          className={`w-full text-left px-4 py-2 rounded-lg font-medium transition-all text-sm ${
            currentPath === '/account-settings'
              ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 text-white'
              : 'text-slate-300 hover:bg-slate-800/80 hover:text-cyan-200'
          }`}
        >
          Account Settings
        </button>
        <button
          onClick={() => signOut()}
          className="w-full px-4 py-2 bg-slate-800 text-slate-200 rounded-lg hover:bg-slate-700 transition-all text-sm font-medium border border-slate-700"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
