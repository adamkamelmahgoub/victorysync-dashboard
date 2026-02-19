import React, { FC, ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';

interface PageLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export const PageLayout: FC<PageLayoutProps> = ({ title, description, children }) => {
  const { globalRole } = useAuth();
  const location = useLocation();
  const isAdmin = globalRole === 'platform_admin' || globalRole === 'admin';

  return (
    <div className="flex min-h-screen text-white">
      <Sidebar isAdmin={isAdmin} currentPath={location.pathname} />

      {/* Main Content */}
      <main className="ml-64 flex-1 overflow-auto">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/75 backdrop-blur">
          <div className="px-8 py-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-white">{title}</h1>
                {description && <p className="text-slate-400 text-sm mt-1">{description}</p>}
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-sm">Today</p>
                <p className="text-lg font-semibold text-cyan-300">{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default PageLayout;
