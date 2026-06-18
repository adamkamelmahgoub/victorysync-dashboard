import React, { FC } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import OrgAPIKeysTab from '../components/OrgAPIKeysTab';

const APIKeysPage: FC = () => {
  const { selectedOrgId } = useAuth();

  if (!selectedOrgId) {
    return (
      <PageLayout title="API Keys" description="Manage organization API keys">
        <div className="vs-surface p-8 text-center">
          <p className="text-sm font-semibold text-slate-900">No organization selected</p>
          <p className="mt-2 text-sm text-slate-600">Select an organization to manage API keys.</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="API Keys" description="Manage organization API keys">
      <div className="space-y-6">
        <div className="vs-surface p-6">
          <div className="mb-6">
            <h2 className="mb-2 text-2xl font-bold text-slate-950">API Keys Management</h2>
            <p className="text-slate-600">Create and manage API keys for your organization to authenticate API requests.</p>
          </div>

          {/* Info Box */}
          <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <h3 className="mb-2 font-semibold text-sky-800">About API Keys</h3>
            <ul className="space-y-1 text-sm text-sky-700">
              <li>• API keys authenticate your application's requests to the VictorySync API</li>
              <li>• Keep your keys secret and never commit them to version control</li>
              <li>• Rotate keys regularly for security</li>
              <li>• Each key shows when it was last used for monitoring</li>
            </ul>
          </div>
        </div>

        {/* API Keys Component */}
        <OrgAPIKeysTab orgId={selectedOrgId} isOrgAdmin={true} />
      </div>
    </PageLayout>
  );
};

export { APIKeysPage };
export default APIKeysPage;
