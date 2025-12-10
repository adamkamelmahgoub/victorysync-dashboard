import React from 'react';
import PlatformApiKeysTab from '../../components/PlatformApiKeysTab';
import AdminTopNav from '../../components/AdminTopNav';

export function AdminApiKeysPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-[0.18em]">Admin</p>
            <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
            <p className="text-xs text-slate-400 mt-1">Manage platform API keys.</p>
          </div>
        </header>

        <AdminTopNav />

        <section>
          <PlatformApiKeysTab />
        </section>
      </div>
    </main>
  );
}

export default AdminApiKeysPage;
