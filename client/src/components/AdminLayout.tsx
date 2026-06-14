import React, { FC } from 'react';
import { PageLayout } from './PageLayout';

interface AdminLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  tabs?: Array<{ id: string; label: string; icon?: string }>;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

export const AdminLayout: FC<AdminLayoutProps> = ({
  title,
  subtitle,
  children,
  tabs,
  activeTab,
  onTabChange,
}) => {
  const actions = tabs && tabs.length > 0 ? (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange?.(tab.id)}
          className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
            activeTab === tab.id
              ? 'border-sky-400/30 bg-sky-400/[0.12] text-sky-100'
              : 'border-white/[0.075] bg-white/[0.035] text-slate-300 hover:bg-white/[0.06] hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <PageLayout title={title} description={subtitle} eyebrow="Admin" actions={actions}>
      {children}
    </PageLayout>
  );
};

export default AdminLayout;
