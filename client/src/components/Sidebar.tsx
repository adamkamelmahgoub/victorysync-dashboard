import React, { FC, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface SidebarProps {
  isAdmin: boolean;
  currentPath: string;
}

type NavItem = { label: string; path: string; badge?: string; featureKey?: string };
type NavGroup = { label: string; items: NavItem[]; defaultCollapsed?: boolean };

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
  Users: 'U',
  Leads: 'Q',
  'API Keys': 'K',
  'Invite Codes': 'I',
  Support: '?',
  Billing: '$',
  MightyCall: 'M',
  'Org Overview': 'G',
  'Number Requests': 'N',
  'Ops Console': 'X',
  Diagnostics: 'D',
  Logs: 'L',
  Settings: 'T',
  'Debug Auth': 'B',
  'Admin Home': 'H',
  'Org Settings': 'S',
  'Org Manage': 'M',
  'Account Settings': 'A',
  'Billing Records': 'B',
  Invoices: 'I',
  'Packages / Plans': 'P',
  Members: 'M',
  'Roles / Permissions': 'R',
  'Number Assignments': 'N',
  'User API Access': 'K',
  Integrations: 'I',
  'Data Sync': 'S',
  'Activity / Audit': 'V',
};

function isActivePath(currentPath: string, itemPath: string) {
  const [currentBase, currentQuery = ''] = currentPath.split('?');
  const [itemBase, itemQuery = ''] = itemPath.split('?');
  if (itemPath === '/') return currentBase === '/';
  if (itemQuery) return currentBase === itemBase && currentQuery === itemQuery;
  if (currentQuery && currentBase === itemBase) return false;
  return currentBase === itemBase || currentBase.startsWith(`${itemBase}/`);
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
      className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition duration-200 ${
        active
          ? 'bg-violet-50 text-violet-900 shadow-[inset_3px_0_0_rgba(124,58,237,0.9),0_8px_20px_rgba(124,58,237,0.08)] ring-1 ring-violet-200/80'
          : 'text-slate-700 hover:bg-white hover:text-slate-950 hover:shadow-sm hover:ring-1 hover:ring-slate-200/80 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-violet-100'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold transition ${active ? 'bg-white text-violet-700 shadow-sm ring-1 ring-violet-100' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/60 group-hover:bg-violet-50 group-hover:text-violet-700 group-hover:ring-violet-100'}`}>
          {navGlyphs[item.label] || '*'}
        </span>
        <span className="truncate font-medium">{item.label}</span>
      </span>
      {item.badge && (
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
          active ? 'border-violet-200 bg-white text-violet-700' : 'border-slate-200 bg-white text-slate-500'
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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    Developer: true,
  });

  const toggleGroup = (label: string) => {
    setCollapsedGroups((current) => ({ ...current, [label]: !(current[label] ?? false) }));
  };

  const navGroups: NavGroup[] = isAdmin
    ? [
        {
          label: 'Command',
          items: [
            { label: 'Overview', path: '/' },
            { label: 'Admin Home', path: '/admin' },
            { label: 'Live Status', path: '/live-status', badge: 'Live', featureKey: 'live_status' },
            { label: 'Reports', path: '/admin/reports' },
            { label: 'Calls', path: '/calls', featureKey: 'reports' },
            { label: 'SMS', path: '/sms', featureKey: 'sms' },
            { label: 'Recordings', path: '/admin/recordings' },
            { label: 'Leads', path: '/leads', badge: 'Live', featureKey: 'leads' },
          ],
        },
        {
          label: 'Operations',
          items: [
            { label: 'Agents', path: '/admin/agents-management' },
            { label: 'Phone Numbers', path: '/numbers', featureKey: 'numbers' },
            { label: 'Number Assignments', path: '/admin/operations?tab=phones' },
            { label: 'Organizations', path: '/admin/orgs' },
            { label: 'Org Overview', path: '/admin/org-overview' },
            ...(selectedOrgId ? [{ label: 'Org Dashboard', path: `/admin/orgs/${selectedOrgId}/dashboard` }] : []),
            { label: 'Members', path: '/admin/operations?tab=members' },
            { label: 'Users', path: '/admin/users' },
            { label: 'User API Access', path: '/admin/operations?tab=users' },
            { label: 'Roles / Permissions', path: '/admin/operations?tab=features' },
            { label: 'Billing', path: '/admin/billing' },
            { label: 'Billing Records', path: '/admin/billing?tab=records' },
            { label: 'Invoices', path: '/admin/billing?tab=invoices' },
            { label: 'Packages / Plans', path: '/admin/billing?tab=packages' },
          ],
        },
        {
          label: 'Platform',
          items: [
            { label: 'MightyCall', path: '/admin/mightycall' },
            { label: 'Integrations', path: '/admin/mightycall?section=integrations' },
            { label: 'Data Sync', path: '/admin/mightycall?section=sync' },
            { label: 'API Keys', path: '/admin/api-keys' },
            { label: 'Invite Codes', path: '/admin/invites' },
            { label: 'Support', path: '/admin/support' },
            { label: 'Number Requests', path: '/admin/number-change-requests' },
            { label: 'Ops Console', path: '/admin/operations' },
            { label: 'Diagnostics', path: '/admin/diagnostics' },
            { label: 'Activity / Audit', path: '/admin/diagnostics?section=audit' },
            { label: 'Logs', path: '/admin/logs' },
            { label: 'Org Settings', path: '/settings' },
            ...(selectedOrgId ? [{ label: 'Org Manage', path: `/orgs/${selectedOrgId}/manage` }] : []),
            { label: 'Account Settings', path: '/account-settings' },
          ],
        },
        {
          label: 'Developer',
          defaultCollapsed: true,
          items: [
            { label: 'Debug Auth', path: '/debug-auth' },
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
            { label: 'Leads', path: '/leads', badge: 'Live', featureKey: 'leads' },
            { label: 'Billing', path: '/billing', featureKey: 'billing' },
            { label: 'API Keys', path: '/api-keys', featureKey: 'api_keys' },
            { label: 'Org Settings', path: '/settings' },
            ...(selectedOrgId ? [{ label: 'Org Manage', path: `/orgs/${selectedOrgId}/manage` }] : []),
            { label: 'Account Settings', path: '/account-settings' },
            { label: 'Support', path: '/support', featureKey: 'support' },
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
    <div className="space-y-2 border-t border-slate-200/80 pt-3">
      <div className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-center gap-3">
        {profile?.profile_pic_url ? (
          <img src={profile.profile_pic_url} alt="User profile" className="h-9 w-9 rounded-xl object-cover ring-1 ring-slate-200" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-sm font-semibold text-violet-700 ring-1 ring-violet-200">
            {userDisplayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-900">{userDisplayName}</div>
          <div className="mt-1 truncate text-xs text-slate-500">{user?.email || 'Account and access controls'}</div>
        </div>
      </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => void toggleTheme()}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-950 active:translate-y-0"
        >
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button
          onClick={() => navigateTo('/account-settings')}
          className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-xs font-semibold shadow-sm transition hover:-translate-y-0.5 active:translate-y-0 ${
            isActivePath(currentPath, '/account-settings')
              ? 'bg-violet-50 text-violet-900'
              : 'bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950'
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
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-50 hover:text-red-700 active:translate-y-0"
      >
        Sign Out
      </button>
    </div>
  );

  const sidebarContent = (
    <>
      <div className="border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-3">
          {selectedOrgLogo ? (
            <img src={selectedOrgLogo} alt="Organization logo" className="h-10 w-10 rounded-2xl object-cover ring-1 ring-slate-200" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-sm font-black text-white shadow-[0_14px_30px_rgba(124,58,237,0.28)]">
              V
            </div>
          )}
          <div>
            <div className="text-sm font-bold text-slate-950">VictorySync</div>
            <div className="text-xs font-medium text-slate-500">CX Command Center</div>
          </div>
        </div>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto pr-1">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => isAdmin || !item.featureKey || (featureAccessLoaded && featureAccess[item.featureKey] !== false));
          if (!visibleItems.length) return null;
          const collapsed = collapsedGroups[group.label] ?? group.defaultCollapsed ?? false;

          return (
            <div key={group.label} className="mb-3">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={!collapsed}
                className="mb-2 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[10px] font-bold uppercase text-slate-500 transition hover:bg-white hover:text-slate-700 hover:shadow-sm focus:outline-none focus:ring-4 focus:ring-violet-100"
              >
                <span>{group.label}</span>
                <span className={`text-xs transition-transform ${collapsed ? '-rotate-90' : 'rotate-0'}`}>v</span>
              </button>
              {!collapsed && (
                <div className="space-y-1">
                  {visibleItems.map((item) => (
                    <NavButton key={item.path} item={item} currentPath={currentPath} onClick={() => navigateTo(item.path)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950"
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

      <aside className={`fixed left-0 top-0 z-50 flex h-screen w-[88vw] max-w-xs flex-col border-r border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfbfd_55%,#f6f3ff_100%)] px-3 pb-4 pt-4 shadow-2xl transition-transform duration-300 lg:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebarContent}
      </aside>

      <aside className="fixed left-0 top-0 hidden h-screen w-[280px] flex-col border-r border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfbfd_55%,#f6f3ff_100%)] px-3 pb-4 pt-4 shadow-[8px_0_30px_rgba(15,23,42,0.04)] lg:flex">
        {sidebarContent}
      </aside>
    </>
  );
};

export default Sidebar;
