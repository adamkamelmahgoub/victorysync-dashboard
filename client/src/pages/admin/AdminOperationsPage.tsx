import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminTopNav from '../../components/AdminTopNav';
import { ApiKeysTab } from '../../components/ApiKeysTab';

interface Organization {
  id: string;
  name: string;
  email: string;
}

export function AdminOperationsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'api-keys' | 'phone-numbers'>('api-keys');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

  useEffect(() => {
    loadOrgs();
  }, []);

  const loadOrgs = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/admin/orgs`, {
        headers: { 'x-user-id': user?.id || '' }
      });
      if (!res.ok) throw new Error(`Failed to load orgs: ${res.status}`);
      const data = await res.json();
      setOrgs(data.orgs || []);
      if (data.orgs?.length > 0 && !selectedOrgId) {
        setSelectedOrgId(data.orgs[0].id);
      }
    } catch (err) {
      console.error('Load orgs failed', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-slate-400">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <header>
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-[0.18em]">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
          <p className="text-xs text-slate-400 mt-1">Manage API keys, phone numbers, and organization settings</p>
        </header>

        <AdminTopNav />

        {/* Organization Selector */}
        {orgs.length > 0 && (
          <div className="border-b border-slate-700">
            <div className="text-sm font-semibold text-slate-300 mb-3">Select Organization</div>
            <div className="flex gap-2 flex-wrap pb-4">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrgId(org.id)}
                  className={`px-3 py-1.5 text-sm rounded transition ${
                    selectedOrgId === org.id
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  {org.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-slate-700 flex gap-8">
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`px-4 py-3 border-b-2 transition font-medium text-sm ${
              activeTab === 'api-keys'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            API Keys
          </button>
          <button
            onClick={() => setActiveTab('phone-numbers')}
            className={`px-4 py-3 border-b-2 transition font-medium text-sm ${
              activeTab === 'phone-numbers'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            Phone Numbers
          </button>
        </div>

        {/* Content */}
        <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-6">
          {activeTab === 'api-keys' && selectedOrgId && (
            <section>
              <h2 className="text-lg font-semibold mb-4">API Keys</h2>
              <ApiKeysTab orgId={selectedOrgId} isOrgAdmin={true} />
            </section>
          )}

          {activeTab === 'phone-numbers' && (
            <section>
              <h2 className="text-lg font-semibold mb-4">Phone Numbers</h2>
              <p className="text-slate-400 text-sm">
                Phone number management is available in the Organizations section. Click on an organization to manage its phone numbers.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

export default AdminOperationsPage;
