import React, { FC, FormEvent, ReactNode, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { DashboardShellHeader } from './DashboardPrimitives';
import StripePortalButton from './StripePortalButton';

interface PageLayoutProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}

export const PageLayout: FC<PageLayoutProps> = ({ title, description, eyebrow, actions, meta, children }) => {
  const { globalRole, selectedOrgId, setSelectedOrgId, orgs, user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = globalRole === 'platform_admin';
  const selectedOrgName = selectedOrgId ? orgs.find((org) => org.id === selectedOrgId)?.name || 'Selected organization' : 'All organizations';
  const userName = profile?.full_name || user?.email || 'Signed in';
  const [topbarSearch, setTopbarSearch] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = topbarSearch.trim();
    if (!query) return;
    navigate(`/calls?search=${encodeURIComponent(query)}`);
  };

  const defaultMeta = (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm ring-1 ring-white xl:text-right">
      <div className="text-[11px] font-semibold uppercase text-slate-500">Today</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{new Date().toLocaleDateString()}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--vs-bg)] text-[var(--vs-text)]">
      <Sidebar isAdmin={isAdmin} currentPath={`${location.pathname}${location.search}`} />

      <main className="min-h-screen pt-14 lg:ml-[280px] lg:pt-0">
        <div className="sticky top-14 z-50 border-b border-slate-200/80 bg-white/86 px-4 shadow-[0_1px_0_rgba(15,23,42,0.03),0_12px_34px_rgba(15,23,42,0.04)] backdrop-blur-xl lg:top-0 lg:px-6">
          <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between gap-4">
            <div className="hidden min-w-0 items-center gap-3 lg:flex">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-sm font-bold text-violet-700 shadow-sm">
                VS
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase text-slate-500">{eyebrow || 'Command center'}</div>
                <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
                <div className="truncate text-xs text-slate-500">{selectedOrgName}</div>
              </div>
            </div>

            <form onSubmit={submitSearch} className="flex flex-1 items-center gap-3 lg:max-w-3xl">
              <label className="relative flex-1">
                <span className="sr-only">Search dashboard</span>
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">/</span>
                <input
                  value={topbarSearch}
                  onChange={(event) => setTopbarSearch(event.target.value)}
                  className="vs-input h-10 w-full pl-9"
                  placeholder="Search calls, numbers, reports..."
                  aria-label="Search dashboard"
                />
              </label>
              <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm lg:block">
                {new Date().toLocaleDateString()}
              </div>
              {isAdmin && (
                <select
                  value={selectedOrgId || ''}
                  onChange={(event) => setSelectedOrgId(event.target.value || null)}
                  className="vs-input hidden h-10 max-w-[220px] text-sm md:block"
                  aria-label="Organization"
                >
                  <option value="">All organizations</option>
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              )}
            </form>

            <div className="hidden items-center gap-3 md:flex">
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm">
                Systems online
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-sm font-semibold text-violet-700 ring-1 ring-violet-200" title={userName}>
                    {userName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden min-w-0 lg:block">
                    <span className="block max-w-[130px] truncate text-xs font-semibold text-slate-900">{userName}</span>
                    <span className="block max-w-[130px] truncate text-[11px] text-slate-500">{user?.email || 'Account'}</span>
                  </span>
                  <span className="text-xs text-slate-500">v</span>
                </button>
                {profileOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.16)] ring-1 ring-white"
                  >
                    <div className="border-b border-slate-100 px-3 py-2">
                      <div className="truncate text-sm font-semibold text-slate-950">{userName}</div>
                      <div className="truncate text-xs text-slate-500">{user?.email || 'Signed in'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/account-settings')}
                      className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Account settings
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/settings')}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Organization settings
                    </button>
                    <StripePortalButton
                      orgId={selectedOrgId}
                      label="Billing portal"
                      loadingLabel="Opening billing..."
                      className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className="mt-2 w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[1680px]">
          <DashboardShellHeader
            eyebrow={eyebrow}
            title={title}
            description={description}
            actions={actions}
            meta={meta || defaultMeta}
          />

          <div className="px-4 py-5 sm:px-5 lg:px-6 lg:py-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default PageLayout;
