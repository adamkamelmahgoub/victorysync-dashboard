import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PageLayout } from '../../components/PageLayout';
import { useToast } from '../../contexts/ToastContext';
import { buildApiUrl } from '../../config';

interface Organization {
  id: string;
  name: string;
  created_at: string;
  total_calls?: number;
  answered_calls?: number;
  answer_rate_pct?: number;
}

interface Member {
  orgMemberId: string;
  user_id: string;
  email: string | null;
  role: string;
  mightycall_extension?: string | null;
}

interface Phone {
  id: string;
  number: string;
  label: string | null;
}

interface User {
  id: string;
  email: string;
  role: string;
  created_at: string;
  can_generate_api_keys: boolean; // New field
}

interface ApiKey {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  key_prefix: string; // First 8 chars of key for display
}

export function AdminOperationsPage() {
  const { user } = useAuth();
  const toast = (() => {
    try {
      return useToast();
    } catch {
      return null as any;
    }
  })();

  const [activeTab, setActiveTab] = useState<'details' | 'members' | 'phones' | 'users'>('details');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create org form
  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Selected org
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [orgMembers, setOrgMembers] = useState<Member[]>([]);
  const [orgPhones, setOrgPhones] = useState<Phone[]>([]);
  const [orgStats, setOrgStats] = useState<any>(null);
  const [orgLoading, setOrgLoading] = useState(false);

  // Phone assignment
  const [allPhones, setAllPhones] = useState<Phone[]>([]);
  const [phonesLoading, setPhoneLoading] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [toRemove, setToRemove] = useState<string[]>([]);
  const [savingPhones, setSavingPhones] = useState(false);

  // All Users
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // User API Keys
  const [userApiKeys, setUserApiKeys] = useState<ApiKey[]>([]);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [generatingApiKey, setGeneratingApiKey] = useState(false);

  // Load orgs on mount
  useEffect(() => {
    loadOrgs();
  }, []);

  // Load org details when selected org changes
  useEffect(() => {
    if (selectedOrg) {
      loadOrgDetails();
      resetPhoneSelection();
    }
  }, [selectedOrg?.id]);

  const loadOrgs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl('/api/admin/org-metrics'), {
        cache: 'no-store',
        headers: { 'x-user-id': user?.id || '' }
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || 'Failed to fetch orgs');
      const list = (j.orgs || []).map((o: any) => ({
        id: o.id,
        name: o.name,
        created_at: o.created_at || new Date().toISOString(),
        total_calls: o.total_calls ?? 0,
        answered_calls: o.answered_calls ?? 0,
        answer_rate_pct: o.answer_rate_pct ?? 0,
      }));
      setOrgs(list);
      if (!selectedOrg && list.length > 0) {
        setSelectedOrg(list[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load organizations');
      console.error('Load orgs error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOrgDetails = async () => {
    if (!selectedOrg) return;
    setOrgLoading(true);
    try {
      const res = await fetch(buildApiUrl(`/api/admin/orgs/${selectedOrg.id}`), {
        cache: 'no-store',
        headers: { 'x-user-id': user?.id || '' }
      });
      if (!res.ok) throw new Error('Failed to load org details');
      const j = await res.json();
      setOrgMembers(j.members || []);
      setOrgPhones(j.phones || []);
      setOrgStats(j.stats || null);
    } catch (err: any) {
      console.error('Load org details error:', err);
    } finally {
      setOrgLoading(false);
    }
  };

  const loadAllPhones = async () => {
    setPhoneLoading(true);
    try {
      const res = await fetch(buildApiUrl('/api/admin/phone-numbers'), {
        cache: 'no-store',
        headers: { 'x-user-id': user?.id || '' }
      });
      if (!res.ok) throw new Error('Failed to load phones');
      const j = await res.json();
      setAllPhones(j.phone_numbers || []);
    } catch (err: any) {
      console.error('Load phones error:', err);
    } finally {
      setPhoneLoading(false);
    }
  };

  const loadAllUsers = async () => {
    setLoadingUsers(true);
    setUserError(null);
    try {
      const res = await fetch(buildApiUrl('/api/admin/users'), {
        cache: 'no-store',
        headers: { 'x-user-id': user?.id || '' }
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || 'Failed to fetch users');
      setAllUsers(j.users || []);
    } catch (err: any) {
      setUserError(err?.message || 'Failed to load users');
      console.error('Load users error:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadUserApiKeys = async (userId: string) => {
    setApiKeyLoading(true);
    setApiKeyError(null);
    try {
      const res = await fetch(buildApiUrl(`/api/admin/users/${userId}/api-keys`), {
        cache: 'no-store',
        headers: { 'x-user-id': user?.id || '' }
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || 'Failed to fetch API keys');
      setUserApiKeys(j.api_keys || []);
    } catch (err: any) {
      setApiKeyError(err?.message || 'Failed to load API keys');
      console.error('Load API keys error:', err);
    } finally {
      setApiKeyLoading(false);
    }
  };

  const handleToggleApiKeyGeneration = async (targetUser: User, canGenerate: boolean) => {
    try {
      const res = await fetch(buildApiUrl(`/api/admin/users/${targetUser.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({ can_generate_api_keys: canGenerate }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || 'Failed to update user setting');
      if (toast?.push) toast.push('User setting updated', 'success');
      await loadAllUsers(); // Refresh user list to reflect change
    } catch (err: any) {
      console.error('Toggle API key generation error:', err);
      if (toast?.push) toast.push(err?.message || 'Failed to update user setting', 'error');
    }
  };

  const handleGenerateApiKey = async (targetUserId: string, label: string) => {
    if (!label.trim()) {
      if (toast?.push) toast.push('API Key label is required', 'error');
      return;
    }
    try {
      setGeneratingApiKey(true);
      const res = await fetch(buildApiUrl(`/api/admin/users/${targetUserId}/api-keys`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({ label }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || 'Failed to generate API key');
      if (toast?.push) toast.push(`API Key generated: ${j.api_key_plaintext}`, 'success', 10000);
      await loadUserApiKeys(targetUserId);
    } catch (err: any) {
      console.error('Generate API key error:', err);
      if (toast?.push) toast.push(err?.message || 'Failed to generate API key', 'error');
    } finally {
      setGeneratingApiKey(false);
    }
  };

  const handleRevokeApiKey = async (targetUserId: string, apiKeyId: string) => {
    try {
      const res = await fetch(buildApiUrl(`/api/admin/users/${targetUserId}/api-keys/${apiKeyId}`), {
        method: 'DELETE',
        headers: { 'x-user-id': user?.id || '' },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || 'Failed to revoke API key');
      if (toast?.push) toast.push('API Key revoked', 'success');
      await loadUserApiKeys(targetUserId);
    } catch (err: any) {
      console.error('Revoke API key error:', err);
      if (toast?.push) toast.push(err?.message || 'Failed to revoke API key', 'error');
    }
  };

  const resetPhoneSelection = () => {
    setToAdd([]);
    setToRemove([]);
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newOrgName.trim()) {
      setCreateError('Organization name is required');
      return;
    }

    try {
      setCreating(true);
      const res = await fetch(buildApiUrl('/api/admin/orgs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({ name: newOrgName }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || 'Failed to create organization');
      setNewOrgName('');
      if (toast?.push) toast.push('Organization created', 'success');
      await loadOrgs();
    } catch (err: any) {
      console.error('Create org error:', err);
      setCreateError(err?.message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const handleSavePhones = async () => {
    if (!selectedOrg) return;
    try {
      setSavingPhones(true);

      // Add phones
      if (toAdd.length > 0) {
        const res = await fetch(buildApiUrl(`/api/admin/orgs/${selectedOrg.id}/phone-numbers`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
          body: JSON.stringify({ phoneNumberIds: toAdd }),
        });
        if (!res.ok) throw new Error('Failed to assign phones');
      }

      // Remove phones
      for (const phoneId of toRemove) {
        const target = (orgPhones.find(p => p.id === phoneId)?.number) || phoneId;
        const res = await fetch(buildApiUrl(`/api/admin/orgs/${selectedOrg.id}/phone-numbers/${encodeURIComponent(target)}`), {
          method: 'DELETE',
          headers: { 'x-user-id': user?.id || '' },
        });
        if (!res.ok) throw new Error('Failed to remove phone');
      }

      if (toast?.push) toast.push('Phone numbers updated', 'success');
      resetPhoneSelection();
      await loadOrgDetails();
    } catch (err: any) {
      console.error('Save phones error:', err);
      if (toast?.push) toast.push(err?.message || 'Failed to update phones', 'error');
    } finally {
      setSavingPhones(false);
    }
  };

  const assignedIds = new Set(orgPhones.map(p => p.id));
  const assigned = allPhones.filter(p => assignedIds.has(p.id) && !toRemove.includes(p.id));
  const available = allPhones.filter(p => !assignedIds.has(p.id) && !toRemove.includes(p.id));

  return (
    <PageLayout title="Operations" description="Manage organizations, members, and phone numbers">
      <div className="space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Operations</h1>
            <p className="text-xs text-slate-400 mt-1">
              Create organizations, manage members and assign phone numbers.
            </p>
          </div>
        </header>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Left: Create Org & Org List */}
          <div className="space-y-4">
            {/* Create Organization Card */}
            <div className="rounded-2xl bg-slate-900/80 ring-1 ring-slate-800 p-5 space-y-4 h-fit">
              <h2 className="font-semibold text-sm">Create Organization</h2>

              {createError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                  {createError}
                </div>
              )}

              <form onSubmit={handleCreateOrg} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Organization name
                  </label>
                  <input
                    type="text"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="e.g., Acme Corp"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 text-white font-semibold rounded-lg text-sm transition"
                >
                  {creating ? 'Creating...' : 'Create Organization'}
                </button>
              </form>
            </div>

            {/* Organizations List */}
            <div className="rounded-2xl bg-slate-900/80 ring-1 ring-slate-800 p-5 overflow-hidden">
              <h2 className="font-semibold text-sm mb-4">Organizations</h2>

              {loading ? (
                <div className="text-xs text-slate-400 text-center py-8">Loading...</div>
              ) : orgs.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-8">No organizations yet</div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {orgs.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => setSelectedOrg(org)}
                      className={`w-full flex items-center justify-between rounded-lg p-3 transition text-left text-sm font-medium ${
                        selectedOrg?.id === org.id
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800/30 hover:bg-slate-800/50 text-slate-200 border border-slate-700/30'
                      }`}
                    >
                      <span>{org.name}</span>
                      <span className="text-xs text-slate-400">→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Organization Details */}
          <div className="rounded-2xl bg-slate-900/80 ring-1 ring-slate-800 overflow-hidden">
            {selectedOrg ? (
              <>
                {/* Org Header */}
                <div className="border-b border-slate-700 bg-slate-900/95 p-5">
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-[0.18em]">
                    {selectedOrg.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    Created {new Date(selectedOrg.created_at).toLocaleDateString()}
                  </p>
                  {orgStats && (
                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div>
                        <div className="text-2xl font-bold text-emerald-400">
                          {orgStats.total_calls || 0}
                        </div>
                        <div className="text-xs text-slate-500">Total Calls</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-400">
                          {orgStats.answered_calls || 0}
                        </div>
                        <div className="text-xs text-slate-500">Answered</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-slate-400">
                          {orgStats.answer_rate_pct || 0}%
                        </div>
                        <div className="text-xs text-slate-500">Answer Rate</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tabs */}
                <div className="border-b border-slate-700 px-5 flex gap-8">
                  {['details', 'members', 'phones', 'users'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveTab(tab as any);
                        if (tab === 'phones' && allPhones.length === 0) {
                          loadAllPhones();
                        }
                        if (tab === 'users' && allUsers.length === 0) {
                          loadAllUsers();
                        }
                      }}
                      className={`py-4 border-b-2 transition font-medium text-sm ${
                        activeTab === tab
                          ? 'border-emerald-500 text-emerald-400'
                          : 'border-transparent text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      {tab === 'details' && 'Details'}
                      {tab === 'members' && 'Members'}
                      {tab === 'phones' && 'Phone Numbers'}
                      {tab === 'users' && 'Users'}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="p-5">
                  {orgLoading ? (
                    <div className="text-xs text-slate-400 text-center py-8">Loading...</div>
                  ) : activeTab === 'details' ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-semibold text-sm mb-3">Organization Details</h3>
                        <div className="space-y-2 text-xs text-slate-400">
                          <div>
                            <span className="text-slate-500">ID:</span> {selectedOrg.id}
                          </div>
                          <div>
                            <span className="text-slate-500">Name:</span> {selectedOrg.name}
                          </div>
                          <div>
                            <span className="text-slate-500">Created:</span>{' '}
                            {new Date(selectedOrg.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : activeTab === 'members' ? (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm">Members</h3>
                      {orgMembers.length === 0 ? (
                        <div className="text-xs text-slate-400 text-center py-8">No members</div>
                      ) : (
                        <div className="space-y-2">
                          {orgMembers.map((member) => (
                            <div
                              key={member.orgMemberId}
                              className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-slate-200">
                                    {member.email || 'Unknown'}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    Role: <span className="capitalize">{member.role}</span>
                                  </div>
                                </div>
                                {member.mightycall_extension && (
                                  <div className="text-xs text-emerald-400 ml-2 flex-shrink-0">
                                    Ext: {member.mightycall_extension}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : activeTab === 'phones' ? (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm mb-4">Assign Phone Numbers</h3>
                      {phonesLoading ? (
                        <div className="text-xs text-slate-400 text-center py-8">Loading...</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          {/* Assigned */}
                          <div>
                            <div className="text-xs font-semibold text-emerald-300 mb-2">
                              Assigned ({assigned.length})
                            </div>
                            <div className="space-y-2 min-h-40 bg-slate-800/20 rounded-lg p-3 border border-emerald-700/30 overflow-y-auto">
                              {assigned.length === 0 ? (
                                <div className="text-xs text-slate-500 text-center py-4">None</div>
                              ) : (
                                assigned.map((phone) => (
                                  <div
                                    key={phone.id}
                                    className="flex items-center justify-between bg-emerald-900/30 border border-emerald-700/50 rounded p-2 text-xs"
                                  >
                                    <div>
                                      <div className="font-medium text-emerald-300">{phone.number}</div>
                                      {phone.label && (
                                        <div className="text-slate-400">{phone.label}</div>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => setToRemove([...toRemove, phone.id])}
                                      className="text-red-400 hover:text-red-300 text-xs ml-2"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Available */}
                          <div>
                            <div className="text-xs font-semibold text-blue-300 mb-2">
                              Available ({available.length})
                            </div>
                            <div className="space-y-2 min-h-40 bg-slate-800/20 rounded-lg p-3 border border-blue-700/30 overflow-y-auto">
                              {available.length === 0 ? (
                                <div className="text-xs text-slate-500 text-center py-4">None</div>
                              ) : (
                                available.map((phone) => (
                                  <div
                                    key={phone.id}
                                    className="flex items-center justify-between bg-blue-900/30 border border-blue-700/50 rounded p-2 text-xs"
                                  >
                                    <div>
                                      <div className="font-medium text-blue-300">{phone.number}</div>
                                      {phone.label && (
                                        <div className="text-slate-400">{phone.label}</div>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => setToAdd([...toAdd, phone.id])}
                                      className="text-emerald-400 hover:text-emerald-300 text-xs ml-2"
                                    >
                                      +
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {(toAdd.length > 0 || toRemove.length > 0) && (
                        <div className="flex gap-2 pt-4 border-t border-slate-700">
                          <button
                            onClick={() => resetPhoneSelection()}
                            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSavePhones}
                            disabled={savingPhones}
                            className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition"
                          >
                            {savingPhones ? 'Saving...' : 'Save Changes'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : activeTab === 'users' ? (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-sm">Users</h3>
                      {loadingUsers ? (
                        <div className="text-xs text-slate-400 text-center py-8">Loading users...</div>
                      ) : userError ? (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                          {userError}
                        </div>
                      ) : allUsers.length === 0 ? (
                        <div className="text-xs text-slate-400 text-center py-8">No users found</div>
                      ) : (
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                          {/* User List */}
                          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                            {allUsers.map((u) => (
                              <button
                                key={u.id}
                                onClick={() => {
                                  setSelectedUser(u);
                                  loadUserApiKeys(u.id);
                                }}
                                className={`w-full flex flex-col items-start rounded-lg p-3 transition text-left text-sm font-medium ${
                                  selectedUser?.id === u.id
                                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-slate-800/30 hover:bg-slate-800/50 text-slate-200 border border-slate-700/30'
                                }`}
                              >
                                <span className="font-semibold">{u.email}</span>
                                <span className="text-xs text-slate-400 capitalize">Role: {u.role}</span>
                              </button>
                            ))}
                          </div>

                          {/* User Details / Settings */}
                          {selectedUser && (
                            <div className="space-y-4">
                              <h4 className="font-semibold text-sm border-b border-slate-700 pb-2 mb-3">{selectedUser.email} Details</h4>

                              {/* API Key Generation Toggle */}
                              <div className="flex items-center justify-between">
                                <label htmlFor="canGenerateApiKeys" className="text-sm text-slate-300">
                                  Allow API Key Generation
                                </label>
                                <input
                                  type="checkbox"
                                  id="canGenerateApiKeys"
                                  checked={selectedUser.can_generate_api_keys}
                                  onChange={(e) => handleToggleApiKeyGeneration(selectedUser, e.target.checked)}
                                  className="form-checkbox h-4 w-4 text-emerald-600 bg-slate-700 border-slate-600 rounded focus:ring-emerald-500"
                                />
                              </div>

                              {/* API Keys Section */}
                              <div className="space-y-3 pt-4 border-t border-slate-700">
                                <h4 className="font-semibold text-sm">API Keys</h4>
                                {selectedUser.can_generate_api_keys ? (
                                  <div className="space-y-3">
                                    {/* Generate New API Key */}
                                    <form onSubmit={(e) => {
                                      e.preventDefault();
                                      const form = e.target as HTMLFormElement;
                                      const labelInput = form.elements.namedItem('newApiKeyLabel') as HTMLInputElement;
                                      if (labelInput) {
                                        handleGenerateApiKey(selectedUser.id, labelInput.value);
                                        labelInput.value = ''; // Clear input
                                      }
                                    }} className="flex gap-2">
                                      <input
                                        type="text"
                                        name="newApiKeyLabel"
                                        placeholder="API Key Label (e.g., My App)"
                                        className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                        disabled={generatingApiKey}
                                      />
                                      <button
                                        type="submit"
                                        disabled={generatingApiKey}
                                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 text-white font-semibold rounded-lg text-sm transition"
                                      >
                                        {generatingApiKey ? 'Generating...' : 'Generate Key'}
                                      </button>
                                    </form>

                                    {apiKeyError && (
                                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                                        {apiKeyError}
                                      </div>
                                    )}

                                    {/* Existing API Keys List */}
                                    {apiKeyLoading ? (
                                      <div className="text-xs text-slate-400 text-center py-4">Loading API keys...</div>
                                    ) : userApiKeys.length === 0 ? (
                                      <div className="text-xs text-slate-400 text-center py-4">No API keys generated.</div>
                                    ) : (
                                      <div className="space-y-2">
                                        {userApiKeys.map((key) => (
                                          <div key={key.id} className="flex items-center justify-between bg-slate-800/30 border border-slate-700/30 rounded-lg p-3 text-xs">
                                            <div>
                                              <div className="font-medium text-slate-200">{key.label} <span className="text-slate-500">({key.key_prefix}...)</span></div>
                                              <div className="text-slate-500 mt-0.5">Created: {new Date(key.created_at).toLocaleDateString()}</div>
                                              {key.last_used_at && <div className="text-slate-500">Last Used: {new Date(key.last_used_at).toLocaleDateString()}</div>}
                                            </div>
                                            <button
                                              onClick={() => handleRevokeApiKey(selectedUser.id, key.id)}
                                              className="text-red-400 hover:text-red-300 text-xs ml-2"
                                            >
                                              Revoke
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-xs text-slate-400 text-center py-4">
                                    API key generation is disabled for this user.
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-5 text-center py-12">
                      <p className="text-slate-400">Select an organization to view details</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-5 text-center py-12">
                <p className="text-slate-400">Select an organization to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default AdminOperationsPage;
