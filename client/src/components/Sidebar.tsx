import React, { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  isAdmin: boolean;
  currentPath: string;
}

type NavItem = { label: string; path: string; badge?: string };
type NavGroup = { label: string; items: NavItem[] };

function isActivePath(currentPath: string, itemPath: string) {
  if (itemPath === '/') return currentPath === '/';
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

function NavButton({
  item,
  currentPath,
  onClick,
}: {
  item: NavItem;
  currentPath: string;
  onClick: () => void;
}) {
  const active = isActivePath(currentPath, item.path);

  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-left text-sm transition ${
        active
          ? 'bg-white/[0.055] text-white shadow-[0_10px_28px_rgba(2,6,23,0.18)]'
          : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
      }`}
    >
      <span className="font-medium">{item.label}</span>
      {item.badge && (
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${
          active ? 'border-transparent bg-cyan-400/[0.08] text-cyan-200' : 'border-transparent text-slate-500'
        }`}>
          {item.badge}
        </span>
      )}
    </button>
  );
}

export const Sidebar: FC<SidebarProps> = ({ isAdmin, currentPath }) => {
  const navigate = useNavigate();
  const { signOut, user, selectedOrgId, orgs } = useAuth();

  const navGroups: NavGroup[] = isAdmin
    ? [
        {
          label: 'Overview',
          items: [
            { label: 'Dashboard', path: '/' },
            { label: 'Live Status', path: '/live-status', badge: 'Live' },
          ],
        },
        {
          label: 'Operations',
          items: [
            { label: 'Phone Numbers', path: '/numbers' },
            { label: 'Agent Management', path: '/admin/agents-management' },
            { label: 'Reports', path: '/admin/reports' },
            { label: 'Recordings', path: '/admin/recordings' },
            { label: 'SMS', path: '/admin/sms' },
          ],
        },
        {
          label: 'Admin',
          items: [
            { label: 'Invite Codes', path: '/admin/invites' },
            { label: 'Support', path: '/admin/support' },
            { label: 'Billing', path: '/admin/billing' },
            { label: 'Operations', path: '/admin/operations' },
          ],
        },
      ]
    : [
        {
          label: 'Overview',
          items: [
            { label: 'Dashboard', path: '/' },
            { label: 'Live Status', path: '/live-status', badge: 'Live' },
          ],
        },
        {
          label: 'Workspace',
          items: [
            { label: 'Phone Numbers', path: '/numbers' },
            { label: 'Reports', path: '/reports' },
            { label: 'Recordings', path: '/recordings' },
            { label: 'SMS', path: '/sms' },
            { label: 'Support', path: '/support' },
            { label: 'Billing', path: '/billing' },
          ],
        },
      ];

  const selectedOrgName = selectedOrgId ? orgs.find((org) => org.id === selectedOrgId)?.name || 'Selected organization' : 'All organizations';

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-72 flex-col border-r border-white/[0.02] bg-[linear-gradient(180deg,rgba(3,7,18,0.96),rgba(7,12,24,0.98))] px-4 pb-4 pt-5 backdrop-blur-xl">
      <div className="rounded-[28px] border border-white/[0.015] bg-white/[0.03] px-4 py-4 shadow-[0_18px_44px_rgba(2,6,23,0.18)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-transparent bg-cyan-400/[0.08] text-sm font-semibold tracking-[0.24em] text-cyan-100">
            VS
          </div>
          <div>
            <div className="text-base font-semibold tracking-[-0.02em] text-white">VictorySync</div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Operations Hub</div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/[0.015] bg-black/20 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Workspace</div>
          <div className="mt-2 text-sm font-medium text-slate-200">{selectedOrgName}</div>
          <div className="mt-1 text-xs text-slate-500">{isAdmin ? 'Platform visibility across organizations' : 'Organization operations view'}</div>
        </div>
      </div>

      <nav className="mt-5 flex-1 overflow-y-auto pr-1">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{group.label}</div>
            <div className="space-y-1.5">
              {group.items.map((item) => (
                <NavButton key={item.path} item={item} currentPath={currentPath} onClick={() => navigate(item.path)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-2 rounded-[26px] border border-white/[0.015] bg-white/[0.03] p-3">
        <div className="px-1">
          <div className="text-sm font-medium text-slate-200">{user?.email || 'Signed in'}</div>
          <div className="mt-1 text-xs text-slate-500">Account and access controls</div>
        </div>
        <button
          onClick={() => navigate('/account-settings')}
          className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
            isActivePath(currentPath, '/account-settings')
              ? 'bg-white/[0.055] text-white'
              : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
          }`}
        >
          Account Settings
        </button>
        <button
          onClick={() => signOut()}
          className="w-full rounded-2xl border border-white/[0.015] bg-black/20 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.04] hover:text-white"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
