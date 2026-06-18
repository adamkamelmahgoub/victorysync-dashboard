import React, { FC, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface SidebarProps {
  isAdmin: boolean;
  currentPath: string;
}

type NavItem = { label: string; path: string; badge?: string; featureKey?: string };
type NavGroup = { label: string; items: NavItem[] };

const navGlyphs: Record<string, string> = {
  Overview: 'O',
  'Live Status': 'L',
  Reports: 'R',
  Calls: 'C',
  SMS: 'S',
  Recordings: 'P',
  Agents: 'A',
  'Phone Numbers': 'N',
  Organizations: 'O',
  Billing: '$',
  Settings: 'T',
};

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
      data-log={`Navigate ${item.label}`}
      data-log-type="navigation_click"
      className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
        active
          ? 'bg-violet-50 text-violet-800 ring-1 ring-violet-200'
          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${active ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500 group-hover:text-slate-800'}`}>
          {navGlyphs[item.label] || '*'}
        </span>
        <span className="truncate font-medium">{item.label}</span>
      </span>
      {item.badge && (
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
          active ? 'border-violet-200 bg-violet-100 text-violet-700' : 'border-slate-200 text-slate-500'
        }`}>
          {item.badge}
        </span>
      )}
    </button>
  );
}

export const Sidebar: FC<SidebarProps> = ({ isAdmin, currentPath }) => {
  const navigate = useNavigate();
  const { signOut, user, selectedOrgId, orgs, profile, featureAccess, featureAccessLoaded } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navGroups: NavGroup[] = isAdmin
    ? [
        {
          label: 'Workspace',
          items: [
            { label: 'Overview', path: '/' },
            { label: 'Live Status', path: '/live-status', badge: 'Live', featureKey: 'live_status' },
            { label: 'Reports', path: '/admin/reports' },
            { label: 'Calls', path: '/calls', featureKey: 'reports' },
            { label: 'SMS', path: '/sms', featureKey: 'sms' },
            { label: 'Recordings', path: '/admin/recordings' },
            { label: 'Agents', path: '/admin/agents-management' },
            { label: 'Phone Numbers', path: '/numbers', featureKey: 'numbers' },
            { label: 'Organizations', path: '/admin/orgs' },
            { label: 'Billing', path: '/admin/billing' },
            { label: 'Settings', path: '/account-settings' },
          ],
        },
      ]
    : [
        {
          label: 'Workspace',
          items: [
            { label: 'Overview', path: '/' },
            { label: 'Live Status', path: '/live-status', badge: 'Live', featureKey: 'live_status' },
            { label: 'Reports', path: '/reports', featureKey: 'reports' },
            { label: 'Calls', path: '/calls', featureKey: 'reports' },
            { label: 'SMS', path: '/sms', featureKey: 'sms' },
            { label: 'Recordings', path: '/recordings', featureKey: 'recordings' },
            { label: 'Agents', path: '/team', featureKey: 'team' },
            { label: 'Phone Numbers', path: '/numbers', featureKey: 'numbers' },
            { label: 'Billing', path: '/billing', featureKey: 'billing' },
            { label: 'Settings', path: '/account-settings' },
          ],
        },
      ];

  const selectedOrgName = selectedOrgId ? orgs.find((org) => org.id === selectedOrgId)?.name || 'Selected organization' : 'All organizations';
  const selectedOrgLogo = selectedOrgId ? orgs.find((org) => org.id === selectedOrgId)?.logo_url || '' : '';
  const userDisplayName = profile?.full_name || user?.email || 'Signed in';

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPath]);

  const navigateTo = (path: string) => {
    setMobileMenuOpen(false);
    navigate(path);
  };

  const accountControls = (
    <div className="space-y-2 border-t border-slate-200 pt-3">
      <div className="flex items-center gap-3 px-1">
        {profile?.profile_pic_url ? (
          <img src={profile.profile_pic_url} alt="User profile" className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-sm font-semibold text-violet-700">
            {userDisplayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-900">{userDisplayName}</div>
          <div className="mt-1 truncate text-xs text-slate-500">{user?.email || 'Account and access controls'}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => void toggleTheme()}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
        >
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button
          onClick={() => navigateTo('/account-settings')}
          className={`w-full rounded-md px-3 py-2 text-left text-xs font-medium transition ${
            isActivePath(currentPath, '/account-settings')
              ? 'bg-slate-100 text-slate-950'
              : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
          }`}
        >
          Settings
        </button>
      </div>
      <div className="px-1">
        <div className="mt-1 text-xs text-slate-500">Account and access controls</div>
      </div>
      <button
        onClick={() => {
          setMobileMenuOpen(false);
          void signOut();
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-red-50 hover:text-red-700"
      >
        Sign Out
      </button>
    </div>
  );

  const sidebarContent = (
    <>
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          {selectedOrgLogo ? (
            <img src={selectedOrgLogo} alt="Organization logo" className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-sm font-black text-white shadow-sm">
              V
            </div>
          )}
          <div>
            <div className="text-sm font-semibold text-slate-950">VictorySync</div>
            <div className="text-xs text-slate-400">CX Command</div>
          </div>
        </div>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto pr-1">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{group.label}</div>
            <div className="space-y-1">
              {group.items.filter((item) => isAdmin || !item.featureKey || (featureAccessLoaded && featureAccess[item.featureKey] !== false)).map((item) => (
                <NavButton key={item.path} item={item} currentPath={currentPath} onClick={() => navigateTo(item.path)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {accountControls}
    </>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase text-slate-500">VictorySync</div>
            <div className="truncate text-sm font-medium text-slate-900">{selectedOrgName}</div>
          </div>
          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
          >
            <span className="flex flex-col gap-1.5">
              <span className={`h-0.5 w-5 rounded-full bg-current transition ${mobileMenuOpen ? 'translate-y-2 rotate-45' : ''}`} />
              <span className={`h-0.5 w-5 rounded-full bg-current transition ${mobileMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`h-0.5 w-5 rounded-full bg-current transition ${mobileMenuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
            </span>
          </button>
        </div>
      </div>

      <div className={`fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-sm transition lg:hidden ${mobileMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setMobileMenuOpen(false)} />

      <aside className={`fixed left-0 top-0 z-50 flex h-screen w-[88vw] max-w-xs flex-col border-r border-slate-200 bg-white px-3 pb-4 pt-4 shadow-2xl transition-transform duration-300 lg:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebarContent}
      </aside>

      <aside className="fixed left-0 top-0 hidden h-screen w-[260px] flex-col border-r border-slate-200 bg-white px-3 pb-4 pt-4 shadow-[1px_0_0_rgba(15,23,42,0.04)] lg:flex">
        {sidebarContent}
      </aside>
    </>
  );
};

export default Sidebar;
