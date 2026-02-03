import React, { FC, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import OrgAPIKeysTab from '../components/OrgAPIKeysTab';

const APIKeysPage: FC = () => {
  const { user, selectedOrgId } = useAuth();

  if (!selectedOrgId) {
    return (
      <PageLayout title="API Keys" description="Manage organization API keys">
        <div className="bg-slate-900/80 rounded-xl p-8 ring-1 ring-slate-800 text-center">
          <p className="text-slate-300">No organization selected</p>
          <p className="text-sm text-slate-500 mt-2">Select an organization to manage API keys.</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="API Keys" description="Manage organization API keys">
      <div className="space-y-6">
        <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">API Keys Management</h2>
            <p className="text-slate-400">Create and manage API keys for your organization to authenticate API requests.</p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mb-6">
            <h3 className="text-blue-300 font-semibold mb-2">About API Keys</h3>
            <ul className="text-blue-300 text-sm space-y-1">
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
