import React, { FC, ReactNode, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';

interface PageLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export const PageLayout: FC<PageLayoutProps> = ({ title, description, children }) => {
  const { globalRole } = useAuth();
  const [currentPath, setCurrentPath] = useState('/');
  const isAdmin = globalRole === 'platform_admin';

  useEffect(() => {
    setCurrentPath(window.location.pathname);
  }, []);

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      <Sidebar isAdmin={isAdmin} currentPath={currentPath} />

      {/* Main Content */}
      <main className="ml-64 flex-1 overflow-auto">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700">
          <div className="px-8 py-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-white">{title}</h1>
                {description && <p className="text-slate-400 text-sm mt-1">{description}</p>}
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-sm">Today</p>
                <p className="text-lg font-semibold text-blue-400">{new Date().toLocaleDateString()}</p>
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
