import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ApiKeysTab } from '../../components/ApiKeysTab';
import AdminTopNav from '../../components/AdminTopNav';

interface OrgData {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subscription_tier?: string;
  created_at?: string;
}

export function OrgOperationsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'api-keys' | 'phone-numbers' | 'users'>('api-keys');

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

  useEffect(() => {
    if (!orgId || !user?.id) return;
    loadOrgData();
  }, [orgId, user?.id]);

  const loadOrgData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/api/admin/orgs/${orgId}`, {
        headers: { 'x-user-id': user?.id || '' }
      });
      if (!res.ok) throw new Error(`Failed to load org: ${res.status}`);
      const data = await res.json();
      setOrg(data.org);
    } catch (err) {
      console.error('Load org failed', err);
      setError(err instanceof Error ? err.message : 'Failed to load organization');
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

  if (error || !org) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-red-400">{error || 'Organization not found'}</p>
            <button
              onClick={() => navigate('/admin/orgs')}
              className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded transition text-sm"
            >
              Back to Organizations
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-[0.18em]">Org Operations</p>
            <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
            <p className="text-xs text-slate-400 mt-1">{org.email}</p>
          </div>
          <button
            onClick={() => navigate('/admin/orgs')}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded transition text-sm"
          >
            Back to Orgs
          </button>
        </header>

        <AdminTopNav />

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
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-3 border-b-2 transition font-medium text-sm ${
              activeTab === 'users'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            Users & Managers
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-6">
          {activeTab === 'api-keys' && (
            <section>
              <h2 className="text-lg font-semibold mb-4">API Keys</h2>
              <ApiKeysTab orgId={org.id} isOrgAdmin={true} />
            </section>
          )}

          {activeTab === 'phone-numbers' && (
            <section>
              <h2 className="text-lg font-semibold mb-4">Phone Numbers</h2>
              <p className="text-slate-400 text-sm">
                Phone number management has been moved. Please manage phone numbers from the Organizations list.
              </p>
            </section>
          )}

          {activeTab === 'users' && (
            <section>
              <h2 className="text-lg font-semibold mb-4">Users & Managers</h2>
              <p className="text-slate-400 text-sm">
                User management has been moved. Please manage users from the Organizations list.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

export default OrgOperationsPage;
