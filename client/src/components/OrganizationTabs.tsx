import { useState } from 'react';

import OrgMembersTab from './OrgMembersTab';
import PhoneNumbersTab from './PhoneNumbersTab';
import AgentsTab from './AgentsTab';
import OrganizationSettingsTab from './OrganizationSettingsTab';

export default function OrganizationTabs({ orgId, isOrgAdmin, adminCheckDone }: { orgId: string; isOrgAdmin: boolean; adminCheckDone?: boolean }) {
  const [tab, setTab] = useState<'members' | 'phones' | 'agents' | 'settings'>('members');

  return (
    <div className="mt-6">
      <div className="flex gap-4 border-b border-gray-800 mb-4">
        <button
          className={`py-2 px-4 ${tab === 'members' ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-gray-400'}`}
          onClick={() => setTab('members')}
        >
          Members
        </button>
        <button
          className={`py-2 px-4 ${tab === 'phones' ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-gray-400'}`}
          onClick={() => setTab('phones')}
        >
          Phone Numbers
        </button>
        <button
          className={`py-2 px-4 ${tab === 'agents' ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-gray-400'}`}
          onClick={() => setTab('agents')}
        >
          Agents & Extensions
        </button>
        <button
          className={`py-2 px-4 ${tab === 'settings' ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-gray-400'}`}
          onClick={() => setTab('settings')}
        >
          Settings
        </button>
      </div>
      <div>
        {tab === 'members' && <OrgMembersTab orgId={orgId} isOrgAdmin={isOrgAdmin} adminCheckDone={adminCheckDone} />}
        {tab === 'phones' && <PhoneNumbersTab orgId={orgId} />}
        {tab === 'agents' && <AgentsTab orgId={orgId} />}
        {tab === 'settings' && <OrganizationSettingsTab orgId={orgId} isOrgAdmin={isOrgAdmin} />}
      </div>
    </div>
  );
}
