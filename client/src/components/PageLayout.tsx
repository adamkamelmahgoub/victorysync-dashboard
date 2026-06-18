import React, { FC, FormEvent, ReactNode, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { DashboardShellHeader } from './DashboardPrimitives';

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
      <Sidebar isAdmin={isAdmin} currentPath={location.pathname} />

      <main className="min-h-screen pt-14 lg:ml-[280px] lg:pt-0">
        <div className="sticky top-14 z-50 border-b border-slate-200/80 bg-white/82 px-4 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur-xl lg:top-0 lg:px-6">
          <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between gap-4">
            <div className="hidden min-w-0 items-center gap-3 lg:flex">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-sm font-bold text-violet-700 shadow-sm">
                VS
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase text-slate-500">Command center</div>
                <div className="truncate text-sm font-semibold text-slate-900">{selectedOrgName}</div>
              </div>
            </div>

            <form onSubmit={submitSearch} className="flex flex-1 items-center gap-3 lg:max-w-2xl">
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
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-800 shadow-sm" title={userName}>
                {userName.slice(0, 1).toUpperCase()}
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-50 hover:text-rose-700 active:translate-y-0"
              >
                Logout
              </button>
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
