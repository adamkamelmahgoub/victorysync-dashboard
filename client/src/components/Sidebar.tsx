import React, { FC, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { preloadRoute } from '../lib/routePreloader';

interface SidebarProps {
  isAdmin: boolean;
  currentPath: string;
}

type NavItem = { label: string; path: string; badge?: string; featureKey?: string };
type NavGroup = { label: string; items: NavItem[]; defaultCollapsed?: boolean };

function NavIcon({ label }: { label: string }) {
  const key = label.toLowerCase();
  const common = {
    className: 'h-[17px] w-[17px]',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (key.includes('live')) return (
    <svg {...common}><path d="M4 12h3l2-5 4 10 2-5h5" /><path d="M12 3a9 9 0 1 1-8.2 5.3" /></svg>
  );
  if (key.includes('report')) return (
    <svg {...common}><path d="M4 19V5" /><path d="M8 19v-7" /><path d="M12 19v-4" /><path d="M16 19V9" /><path d="M20 19V7" /></svg>
  );
  if (key.includes('call')) return (
    <svg {...common}><path d="M22 16.9v2.4a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.2 19.2 0 0 1-5.9-5.9 19.7 19.7 0 0 1-3.1-8.7A2 2 0 0 1 4.2 1.5h2.4a2 2 0 0 1 2 1.7l.4 2.6a2 2 0 0 1-.6 1.8L7.4 8.7a16 16 0 0 0 7.9 7.9l1.1-1.1a2 2 0 0 1 1.8-.5l2.6.4a2 2 0 0 1 1.2 1.5Z" /></svg>
  );
  if (key === 'sms') return (
    <svg {...common}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 9h8" /><path d="M8 13h5" /></svg>
  );
  if (key.includes('record')) return (
    <svg {...common}><rect x="4" y="5" width="16" height="14" rx="3" /><circle cx="12" cy="12" r="3" /><path d="M4 9h16" /></svg>
  );
  if (key.includes('agent') || key.includes('team') || key.includes('user')) return (
    <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></svg>
  );
  if (key.includes('phone') || key.includes('number')) return (
    <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /><path d="M10 6h4" /></svg>
  );
  if (key.includes('org')) return (
    <svg {...common}><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-7h6v7" /><path d="M9 9h.01" /><path d="M15 9h.01" /></svg>
  );
  if (key.includes('lead')) return (
    <svg {...common}><path d="M3 12h6l2 7 4-14 2 7h4" /><path d="M4 4h16v16H4z" /></svg>
  );
  if (key.includes('billing') || key.includes('invoice')) return (
    <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /><path d="M15 15h2" /></svg>
  );
  if (key.includes('api') || key.includes('key')) return (
    <svg {...common}><circle cx="7.5" cy="15.5" r="3.5" /><path d="M10 13l9-9" /><path d="M15 4h4v4" /></svg>
  );
  if (key.includes('invite')) return (
    <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /><path d="M17 17v-4" /><path d="M15 15h4" /></svg>
  );
  if (key.includes('email') || key.includes('notification')) return (
    <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /><path d="M17 11.5h3" /><path d="M17 15h3" /></svg>
  );
  if (key.includes('support')) return (
    <svg {...common}><path d="M12 18h.01" /><path d="M9.1 9a3 3 0 1 1 5.8 1c-.6 1.7-2.9 1.7-2.9 4" /><circle cx="12" cy="12" r="10" /></svg>
  );
  if (key.includes('mighty') || key.includes('sync')) return (
    <svg {...common}><path d="M21 12a9 9 0 0 1-15.5 6.2" /><path d="M3 12a9 9 0 0 1 15.5-6.2" /><path d="M18 3v5h-5" /><path d="M6 21v-5h5" /></svg>
  );
  if (key.includes('ops') || key.includes('console')) return (
    <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m8 9 3 3-3 3" /><path d="M13 15h4" /></svg>
  );
  if (key.includes('diagnostic') || key.includes('debug')) return (
    <svg {...common}><path d="M8 2h8" /><path d="M9 2v6l-5 9a3 3 0 0 0 2.6 4.5h10.8A3 3 0 0 0 20 17l-5-9V2" /><path d="M8.5 14h7" /></svg>
  );
  if (key.includes('log')) return (
    <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h6" /></svg>
  );
  if (key.includes('setting')) return (
    <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.4 7A2 2 0 1 1 7.2 4.2l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6h.2a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 20 7.2l-.1.1a1.7 1.7 0 0 0-.3 1.9v.2a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z" /></svg>
  );
  return (
    <svg {...common}><path d="M4 13a8 8 0 1 1 16 0" /><path d="M12 13l4-5" /><path d="M4 13h16" /><path d="M7 17h10" /></svg>
  );
}

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
      onMouseEnter={() => preloadRoute(item.path)}
      onFocus={() => preloadRoute(item.path)}
      data-log={`Navigate ${item.label}`}
      data-log-type="navigation_click"
      className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition duration-200 ${
        active
          ? 'bg-white text-violet-950 shadow-[inset_3px_0_0_rgba(124,58,237,0.95),0_10px_28px_rgba(124,58,237,0.12)] ring-1 ring-violet-200/90'
          : 'text-slate-700 hover:bg-white hover:text-slate-950 hover:shadow-[0_8px_22px_rgba(15,23,42,0.07)] hover:ring-1 hover:ring-slate-200/80 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-violet-100'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition ${active ? 'bg-violet-600 text-white shadow-[0_10px_22px_rgba(124,58,237,0.24)] ring-1 ring-violet-500/40' : 'bg-white text-slate-500 shadow-sm ring-1 ring-slate-200/80 group-hover:bg-violet-50 group-hover:text-violet-700 group-hover:ring-violet-200'}`}>
          <NavIcon label={item.label} />
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
  const { toggleTheme } = useTheme();
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
            { label: 'Organizations', path: '/admin/orgs' },
            ...(selectedOrgId ? [{ label: 'Org Dashboard', path: `/admin/orgs/${selectedOrgId}/dashboard` }] : []),
            { label: 'Users', path: '/admin/users' },
            { label: 'Ops Console', path: '/admin/operations' },
            { label: 'Billing', path: '/admin/billing' },
          ],
        },
        {
          label: 'Platform',
          items: [
            { label: 'MightyCall', path: '/admin/mightycall' },
            { label: 'API Keys', path: '/admin/api-keys' },
            { label: 'Invite Codes', path: '/admin/invites' },
            { label: 'Support', path: '/admin/support' },
            { label: 'Email Preferences', path: '/admin/email-preferences' },
            { label: 'Number Requests', path: '/admin/number-change-requests' },
            { label: 'Diagnostics', path: '/admin/diagnostics' },
            { label: 'Logs', path: '/admin/logs' },
            { label: 'Settings', path: '/account-settings' },
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
            { label: 'Account Settings', path: '/account-settings' },
            { label: 'Email Preferences', path: '/email-preferences' },
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
          Light UI
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
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#7c3aed_0%,#4f46e5_58%,#312e81_100%)] text-sm font-black text-white shadow-[0_16px_32px_rgba(79,70,229,0.28)] ring-1 ring-violet-300/60">
              <span className="absolute inset-0 rounded-2xl bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]" />
              <span className="relative">VS</span>
            </div>
          )}
          <div>
            <div className="text-[15px] font-extrabold text-slate-950">VictorySync</div>
            <div className="text-xs font-semibold text-slate-500">CX Command Center</div>
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
                className="mb-2 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[10px] font-extrabold uppercase text-slate-500 transition hover:bg-white hover:text-slate-800 hover:shadow-sm focus:outline-none focus:ring-4 focus:ring-violet-100"
              >
                <span>{group.label}</span>
                <svg className={`h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : 'rotate-0'}`} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="m5 7 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
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

      <aside className={`fixed left-0 top-0 z-50 flex h-screen w-[88vw] max-w-xs flex-col border-r border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_58%,#f4f0ff_100%)] px-3 pb-4 pt-4 shadow-2xl transition-transform duration-300 lg:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebarContent}
      </aside>

      <aside className="fixed left-0 top-0 hidden h-screen w-[280px] flex-col border-r border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_58%,#f4f0ff_100%)] px-3 pb-4 pt-4 shadow-[10px_0_32px_rgba(15,23,42,0.05)] lg:flex">
        {sidebarContent}
      </aside>
    </>
  );
};

export default Sidebar;
