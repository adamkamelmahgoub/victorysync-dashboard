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
  const { globalRole } = useAuth();
  const location = useLocation();
  const isAdmin = globalRole === 'platform_admin';

  const defaultMeta = (
    <div className="rounded-2xl border border-white/[0.03] bg-white/[0.03] px-4 py-3 text-left xl:text-right">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Today</div>
      <div className="mt-2 text-sm font-medium text-slate-200">{new Date().toLocaleDateString()}</div>
    </div>
  );

  return (
    <div className="flex min-h-screen text-white">
      <Sidebar isAdmin={isAdmin} currentPath={location.pathname} />

      <main className="ml-72 flex-1 overflow-auto">
        <DashboardShellHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          actions={actions}
          meta={meta || defaultMeta}
        />

        <div className="px-6 py-6 sm:px-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default PageLayout;
