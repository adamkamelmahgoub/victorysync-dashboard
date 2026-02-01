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
    { label: 'Dashboard', path: '/', icon: 'icon-dashboard' },
    { label: 'Phone Numbers', path: '/numbers', icon: 'icon-phone' },
    { label: 'Reports', path: '/admin/reports', icon: 'icon-report' },
    { label: 'Recordings', path: '/admin/recordings', icon: 'icon-record' },
    { label: 'SMS', path: '/admin/sms', icon: 'icon-message' },
    { label: 'Support', path: '/admin/support', icon: 'icon-ticket' },
    { label: 'Billing', path: '/admin/billing', icon: 'icon-billing' },
    { label: 'Operations', path: '/admin/operations', icon: 'icon-settings' },
  ];

  const clientItems = [
    { label: 'Dashboard', path: '/', icon: 'icon-dashboard' },
    { label: 'Phone Numbers', path: '/numbers', icon: 'icon-phone' },
    { label: 'Reports', path: '/reports', icon: 'icon-report' },
    { label: 'Recordings', path: '/recordings', icon: 'icon-record' },
    { label: 'SMS', path: '/sms', icon: 'icon-message' },
    { label: 'Support', path: '/support', icon: 'icon-ticket' },
  ];

  const menuItems = isAdmin ? adminItems : clientItems;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 border-r border-slate-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">VS</span>
          </div>
          <h1 className="text-lg font-bold text-white">VictorySync</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all text-sm ${
              currentPath === item.path
                ? 'bg-cyan-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-cyan-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700 space-y-2">
        <button
          onClick={() => navigate('/account-settings')}
          className={`w-full text-left px-4 py-2 rounded-lg font-medium transition-all text-sm ${
            currentPath === '/account-settings'
              ? 'bg-cyan-600 text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-cyan-300'
          }`}
        >
          ⚙️ Account Settings
        </button>
        <button
          onClick={() => signOut()}
          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm font-medium"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
