import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { ApiKeysTab } from '../../components/ApiKeysTab';
import { buildApiUrl } from '../../config';

interface Organization {
  id: string;
  name: string;
  email: string;
}

export function AdminOperationsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'api-keys'>('api-keys');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrgs();
  }, []);

  const loadOrgs = async () => {
    try {
      setLoading(true);
      const res = await fetch(buildApiUrl('/api/admin/orgs'), {
        cache: 'no-store',
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
      <PageLayout title="Operations" description="Manage API keys, phone numbers, and organization settings">
        <div className="text-center py-12">
          <p className="text-slate-400">Loading...</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Operations" description="Manage API keys, phone numbers, and organization settings">
      <div className="space-y-6">
        <AdminTopNav />

        {/* Organization Selector Card */}
        {orgs.length > 0 && (
          <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
            <h3 className="text-sm font-semibold text-white mb-4">Select Organization</h3>
            <div className="flex gap-3 flex-wrap">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrgId(org.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition duration-200 border ${
                    selectedOrgId === org.id
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {org.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab Navigation Card */}
        <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
          <div className="px-6 border-b border-slate-700">
            <button
              onClick={() => setActiveTab('api-keys')}
              className={`px-0 py-4 border-b-2 transition font-medium text-sm ${
                activeTab === 'api-keys'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              API Keys
            </button>
          </div>

          {/* Content Section */}
          <div className="p-6">
            {activeTab === 'api-keys' && selectedOrgId && (
              <section>
                <h2 className="text-lg font-semibold text-white mb-6">API Keys Management</h2>
                <ApiKeysTab orgId={selectedOrgId} isOrgAdmin={true} />
              </section>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default AdminOperationsPage;
