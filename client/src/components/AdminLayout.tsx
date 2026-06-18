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
          className={`rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 active:translate-y-0 ${
            activeTab === tab.id
              ? 'border-violet-200 bg-violet-50 text-violet-800'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950'
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
