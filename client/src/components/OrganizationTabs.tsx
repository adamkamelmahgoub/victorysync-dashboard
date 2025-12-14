import { useState } from 'react';

import OrgMembersTab from './OrgMembersTab';
import PhoneNumbersTab from './PhoneNumbersTab';
import AgentsTab from './AgentsTab';
import OrganizationSettingsTab from './OrganizationSettingsTab';

export default function OrganizationTabs({ orgId, isOrgAdmin, adminCheckDone }: { orgId: string; isOrgAdmin: boolean; adminCheckDone?: boolean }) {
  const [tab, setTab] = useState<'members' | 'phones' | 'agents' | 'settings'>('members');

  return (
    <div className="mt-6">
      <div className="flex gap-2 items-center mb-4">
        <div className="rounded bg-slate-900/50 p-1 flex gap-2">
          <button
            className={`py-2 px-4 rounded text-sm ${tab === 'members' ? 'bg-emerald-700/20 text-emerald-300' : 'text-gray-400 hover:bg-slate-800/40'}`}
            onClick={() => setTab('members')}
          >
            Members
          </button>
          <button
            className={`py-2 px-4 rounded text-sm ${tab === 'phones' ? 'bg-emerald-700/20 text-emerald-300' : 'text-gray-400 hover:bg-slate-800/40'}`}
            onClick={() => setTab('phones')}
          >
            Phone Numbers
          </button>
          <button
            className={`py-2 px-4 rounded text-sm ${tab === 'agents' ? 'bg-emerald-700/20 text-emerald-300' : 'text-gray-400 hover:bg-slate-800/40'}`}
            onClick={() => setTab('agents')}
          >
            Agents & Extensions
          </button>
          <button
            className={`py-2 px-4 rounded text-sm ${tab === 'settings' ? 'bg-emerald-700/20 text-emerald-300' : 'text-gray-400 hover:bg-slate-800/40'}`}
            onClick={() => setTab('settings')}
          >
            Settings
          </button>
        </div>
      </div>
      <div>
        {tab === 'members' && <OrgMembersTab orgId={orgId} isOrgAdmin={isOrgAdmin} adminCheckDone={adminCheckDone} />}
        {tab === 'phones' && <PhoneNumbersTab orgId={orgId} />}
        {tab === 'agents' && <AgentsTab orgId={orgId} />}
        {tab === 'settings' && <OrganizationSettingsTab orgId={orgId} isOrgAdmin={isOrgAdmin} adminCheckDone={adminCheckDone} />}
      </div>
    </div>
  );
}
