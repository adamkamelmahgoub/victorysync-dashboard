import React, { FC, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
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
  const { globalRole, selectedOrgId, setSelectedOrgId, orgs, user, profile } = useAuth();
  const location = useLocation();
  const isAdmin = globalRole === 'platform_admin';
  const selectedOrgName = selectedOrgId ? orgs.find((org) => org.id === selectedOrgId)?.name || 'Selected organization' : 'All organizations';
  const userName = profile?.full_name || user?.email || 'Signed in';

  const defaultMeta = (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.045] px-3 py-2 text-left xl:text-right">
      <div className="text-[11px] font-semibold uppercase text-slate-500">Today</div>
      <div className="mt-1 text-sm font-medium text-slate-200">{new Date().toLocaleDateString()}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--vs-bg)] text-white">
      <Sidebar isAdmin={isAdmin} currentPath={location.pathname} />

      <main className="min-h-screen pt-14 lg:ml-[260px] lg:pt-0">
        <div className="sticky top-14 z-50 border-b border-white/[0.07] bg-[#070a13]/86 px-4 backdrop-blur-2xl lg:top-0 lg:px-6">
          <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between gap-4">
            <div className="hidden min-w-0 items-center gap-3 lg:flex">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-400/10 text-sm font-bold text-violet-100">
                VS
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Command center</div>
                <div className="truncate text-sm font-semibold text-slate-100">{selectedOrgName}</div>
              </div>
            </div>

            <div className="flex flex-1 items-center gap-3 lg:max-w-2xl">
              <label className="relative flex-1">
                <span className="sr-only">Search dashboard</span>
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">/</span>
                <input
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
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <div className="rounded-lg border border-emerald-300/20 bg-emerald-400/[0.07] px-3 py-2 text-xs font-semibold text-emerald-200">
                Systems online
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-sm font-semibold text-white" title={userName}>
                {userName.slice(0, 1).toUpperCase()}
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
