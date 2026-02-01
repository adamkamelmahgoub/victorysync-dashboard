import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminTopNav from '../../components/AdminTopNav';
import { getOrgIntegrations, saveOrgIntegration, deleteOrgIntegration } from '../../lib/apiClient';

interface Integration {
  id: string;
  org_id: string;
  integration_type: string;
  label: string;
  created_at: string;
  updated_at: string;
}

export default function AdminMightyCallPage() {
  const navigate = useNavigate();
  const { user, selectedOrgId, globalRole, orgs } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [userKey, setUserKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.mightycall.com');
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  useEffect(() => {
    // For platform admins, allow selecting from dropdown; otherwise use selectedOrgId
    if (globalRole === 'platform_admin' && orgs && orgs.length > 0 && !activeOrgId) {
      setActiveOrgId(orgs[0].id);
    } else if (selectedOrgId) {
      setActiveOrgId(selectedOrgId);
    }
  }, [selectedOrgId, globalRole, orgs]);

  useEffect(() => {
    if (!activeOrgId) return;
    loadIntegrations();
  }, [activeOrgId, user?.id]);

  const loadIntegrations = async () => {
    if (!activeOrgId || !user?.id) return;
    try {
      setLoading(true);
      const data = await getOrgIntegrations(activeOrgId, user.id);
      setIntegrations(data.integrations || []);
      setError(null);
    } catch (err: any) {
      console.error('failed to load integrations:', err);
      setError(err?.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveIntegration = async () => {
    if (!activeOrgId || !user?.id || !apiKey || !userKey) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setIsCreating(true);
      await saveOrgIntegration(
        activeOrgId,
        {
          integration_type: 'mightycall',
          label: 'MightyCall',
          credentials: { api_key: apiKey, user_key: userKey, base_url: baseUrl }
        },
        user.id
      );
      setApiKey('');
      setUserKey('');
      setError(null);
      await loadIntegrations();
    } catch (err: any) {
      console.error('failed to save integration:', err);
      setError(err?.message || 'Failed to save integration');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteIntegration = async (integrationId: string) => {
    if (!activeOrgId || !user?.id) return;
    if (!confirm('Are you sure you want to delete this integration?')) return;

    try {
      await deleteOrgIntegration(activeOrgId, integrationId, user.id);
      await loadIntegrations();
    } catch (err: any) {
      console.error('failed to delete integration:', err);
      setError(err?.message || 'Failed to delete integration');
    }
  };

  if (!globalRole || !['platform_admin', 'org_admin'].includes(globalRole)) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-slate-400">You don't have permission to manage integrations.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">MightyCall Integrations</h1>
            <p className="mt-2 text-sm text-slate-400">Manage MightyCall API credentials for your organization</p>
          </div>
          <button
            onClick={() => navigate('/admin/orgs')}
            className="text-sm text-slate-300 hover:text-emerald-400 transition"
          >
            ← Back
          </button>
        </header>

        <AdminTopNav />

        {/* Org selector for platform admins */}
        {globalRole === 'platform_admin' && orgs && orgs.length > 0 && (
          <div className="rounded-lg bg-slate-900 border border-slate-800 p-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">Select Organization</label>
            <select
              value={activeOrgId || ''}
              onChange={(e) => setActiveOrgId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded p-4 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Create new integration form */}
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-6 space-y-4">
          <h2 className="text-lg font-medium text-slate-100">Add MightyCall Credentials</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter MightyCall API Key"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">User Key</label>
              <input
                type="password"
                value={userKey}
                onChange={(e) => setUserKey(e.target.value)}
                placeholder="Enter MightyCall User Key"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.mightycall.com"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              onClick={handleSaveIntegration}
              disabled={isCreating || !apiKey || !userKey}
              className="w-full px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 transition"
            >
              {isCreating ? 'Saving...' : 'Save Integration'}
            </button>
          </div>
        </div>

        {/* Existing integrations */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-slate-100">Active Integrations</h2>

          {loading ? (
            <div className="text-sm text-slate-400">Loading integrations...</div>
          ) : integrations.length === 0 ? (
            <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 text-slate-400 text-sm">
              No integrations configured yet.
            </div>
          ) : (
            <div className="space-y-3">
              {integrations.map((integration) => (
                <div key={integration.id} className="rounded-lg bg-slate-900 border border-slate-800 p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-slate-100">{integration.label}</h3>
                    <p className="text-xs text-slate-400">
                      Type: {integration.integration_type} • Updated: {new Date(integration.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteIntegration(integration.id)}
                    className="px-3 py-1.5 text-sm bg-red-900/20 text-red-300 border border-red-700/50 rounded hover:bg-red-900/40 transition"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

