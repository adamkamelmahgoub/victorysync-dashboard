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
    <div className="rounded-md border border-white/[0.075] bg-white/[0.035] px-3 py-2 text-left xl:text-right">
      <div className="text-[11px] font-semibold uppercase text-slate-500">Today</div>
      <div className="mt-1 text-sm font-medium text-slate-200">{new Date().toLocaleDateString()}</div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#0d0d0e] text-white">
      <Sidebar isAdmin={isAdmin} currentPath={location.pathname} />

      <main className="flex-1 overflow-auto pt-14 lg:ml-60 lg:pt-0">
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
      </main>
    </div>
  );
};

export default PageLayout;
