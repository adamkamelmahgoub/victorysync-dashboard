import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PageLayout } from '../../components/PageLayout';
import { buildApiUrl } from '../../config';

interface TabConfig {
  id: string;
  label: string;
  icon: string;
}

interface User {
  id: string;
  email: string;
  created_at?: string;
  global_role?: string;
  orgs?: Array<{ id: string; name: string }>;
}

interface Org {
  id: string;
  name: string;
  created_at?: string;
}

interface Invitation {
  id?: string;
  email: string;
  org_id: string;
  role: string;
  invited_at?: string;
  invited_by?: string;
  status?: 'pending' | 'accepted';
}

const AdminDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Organizations
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>('');

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Org Members
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Invitations
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteOrgId, setInviteOrgId] = useState('');
  const [inviteRole, setInviteRole] = useState('agent');
  const [invitingLoading, setInvitingLoading] = useState(false);

  // Settings
  const [settings, setSettings] = useState<any>({});
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Form states
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserOrgId, setNewUserOrgId] = useState('');
  const [newUserRole, setNewUserRole] = useState('agent');
  const [createUserLoading, setCreateUserLoading] = useState(false);

  const tabs: TabConfig[] = [
    { id: 'overview', label: '📊 Overview', icon: 'chart' },
    { id: 'organizations', label: '🏢 Organizations', icon: 'building' },
    { id: 'users', label: '👥 Users', icon: 'users' },
    { id: 'members', label: '👤 Members & Invites', icon: 'member' },
    { id: 'settings', label: '⚙️ Settings', icon: 'settings' },
  ];

  // Load data
  useEffect(() => {
    if (user?.id) {
      fetchOrganizations();
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'members' && selectedOrg) {
      fetchOrgMembers();
    }
  }, [activeTab, selectedOrg]);

  const fetchOrganizations = async () => {
    try {
      const res = await fetch(buildApiUrl('/api/admin/orgs'), {
        headers: { 'x-user-id': user?.id || '' },
        cache: 'no-store'
      });
      const data = await res.json();
      setOrgs(data.orgs || []);
      if (data.orgs?.length > 0 && !selectedOrg) {
        setSelectedOrg(data.orgs[0].id);
      }
    } catch (err) {
      setError('Failed to load organizations');
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/admin/users', {
        headers: { 'x-user-id': user?.id || '' },
        cache: 'no-store'
      });
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      setError('Failed to load users');
      console.error(err);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchOrgMembers = async () => {
    if (!selectedOrg) return;
    setMembersLoading(true);
    try {
      const res = await fetch(buildApiUrl(`/api/orgs/${selectedOrg}/members`), {
        headers: { 'x-user-id': user?.id || '' },
        cache: 'no-store'
      });
      const data = await res.json();
      setOrgMembers(data.members || []);
    } catch (err) {
      setError('Failed to load members');
      console.error(err);
    } finally {
      setMembersLoading(false);
    }
  };

  const createNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(buildApiUrl('/api/admin/users'), {
        method: 'POST',
        headers: {
          'x-user-id': user?.id || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          orgId: newUserOrgId,
          role: newUserRole
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Failed to create user');
        return;
      }

      setSuccess(`User ${newUserEmail} created successfully!`);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserOrgId('');
      setNewUserRole('agent');
      fetchUsers();
    } catch (err) {
      setError('Error creating user');
      console.error(err);
    } finally {
      setCreateUserLoading(false);
    }
  };

  const inviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvitingLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(buildApiUrl(`/api/orgs/${inviteOrgId}/members`), {
        method: 'POST',
        headers: {
          'x-user-id': user?.id || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Failed to send invitation');
        return;
      }

      setSuccess(`Invitation sent to ${inviteEmail}!`);
      setInviteEmail('');
      setInviteRole('agent');
      if (selectedOrg === inviteOrgId) {
        fetchOrgMembers();
      }
    } catch (err) {
      setError('Error sending invitation');
      console.error(err);
    } finally {
      setInvitingLoading(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!selectedOrg) return;
    try {
      const res = await fetch(buildApiUrl(`/api/orgs/${selectedOrg}/members/${userId}`), {
        method: 'DELETE',
        headers: { 'x-user-id': user?.id || '' }
      });

      if (res.ok) {
        setSuccess('Member removed successfully');
        fetchOrgMembers();
      } else {
        setError('Failed to remove member');
      }
    } catch (err) {
      setError('Error removing member');
      console.error(err);
    }
  };

  return (
    <PageLayout title="Admin Dashboard" description="Manage organizations, users, and settings">
      <div className="h-full flex gap-6">
        {/* Sidebar Navigation */}
        <div className="w-48 bg-slate-900/50 rounded-lg p-4 space-y-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-4 py-2 rounded-lg transition ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-6">
          {/* Messages */}
          {error && (
            <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-emerald-900/20 border border-emerald-700 text-emerald-300 px-4 py-3 rounded-lg">
              {success}
            </div>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white">Dashboard Overview</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                  <p className="text-slate-400 text-sm">Total Organizations</p>
                  <p className="text-3xl font-bold text-blue-400">{orgs.length}</p>
                </div>
                <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                  <p className="text-slate-400 text-sm">Total Users</p>
                  <p className="text-3xl font-bold text-emerald-400">{users.length}</p>
                </div>
                <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                  <p className="text-slate-400 text-sm">Org Members</p>
                  <p className="text-3xl font-bold text-purple-400">{orgMembers.length}</p>
                </div>
              </div>
            </div>
          )}

          {/* Organizations Tab */}
          {activeTab === 'organizations' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white">Organizations</h2>
              <div className="bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-900 border-b border-slate-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Name</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Created</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {orgs.map(org => (
                      <tr key={org.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-6 py-4 text-white">{org.name}</td>
                        <td className="px-6 py-4 text-slate-400 text-sm">
                          {org.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => {
                              setSelectedOrg(org.id);
                              setActiveTab('members');
                            }}
                            className="text-blue-400 hover:text-blue-300 text-sm"
                          >
                            Manage →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Manage Users</h2>
              </div>

              {/* Create New User Form */}
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4">Create New User</h3>
                <form onSubmit={createNewUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={e => setNewUserEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                    <input
                      type="password"
                      value={newUserPassword}
                      onChange={e => setNewUserPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Organization</label>
                    <select
                      value={newUserOrgId}
                      onChange={e => setNewUserOrgId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                      required
                    >
                      <option value="">Select organization...</option>
                      {orgs.map(org => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                    <select
                      value={newUserRole}
                      onChange={e => setNewUserRole(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                    >
                      <option value="agent">Agent</option>
                      <option value="org_manager">Manager</option>
                      <option value="org_admin">Admin</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={createUserLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white px-4 py-2 rounded font-medium"
                  >
                    {createUserLoading ? 'Creating...' : 'Create User'}
                  </button>
                </form>
              </div>

              {/* Users List */}
              <div className="bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
                <div className="p-6 border-b border-slate-700">
                  <h3 className="text-lg font-semibold text-white">All Users</h3>
                </div>
                {usersLoading ? (
                  <div className="p-6 text-slate-400">Loading users...</div>
                ) : users.length === 0 ? (
                  <div className="p-6 text-slate-400">No users found</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-slate-900 border-b border-slate-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Email</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Role</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {users.map(u => (
                        <tr key={u.id} className="hover:bg-slate-800/30 transition">
                          <td className="px-6 py-4 text-white">{u.email}</td>
                          <td className="px-6 py-4 text-slate-400 text-sm">{u.global_role || '—'}</td>
                          <td className="px-6 py-4 text-slate-400 text-sm">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Members & Invites Tab */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-white">Members & Invitations</h2>
                <select
                  value={selectedOrg}
                  onChange={e => setSelectedOrg(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                >
                  {orgs.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>

              {/* Invite User Form */}
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4">Invite User to Organization</h3>
                <form onSubmit={inviteUser} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                      placeholder="user@example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                    >
                      <option value="agent">Agent</option>
                      <option value="org_manager">Manager</option>
                      <option value="org_admin">Admin</option>
                    </select>
                  </div>
                  <input type="hidden" value={selectedOrg} onChange={e => setInviteOrgId(e.target.value)} />
                  <button
                    type="submit"
                    disabled={invitingLoading || !selectedOrg}
                    onClick={() => setInviteOrgId(selectedOrg)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white px-4 py-2 rounded font-medium"
                  >
                    {invitingLoading ? 'Sending...' : 'Send Invitation'}
                  </button>
                </form>
              </div>

              {/* Members List */}
              <div className="bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
                <div className="p-6 border-b border-slate-700">
                  <h3 className="text-lg font-semibold text-white">Organization Members</h3>
                </div>
                {membersLoading ? (
                  <div className="p-6 text-slate-400">Loading members...</div>
                ) : orgMembers.length === 0 ? (
                  <div className="p-6 text-slate-400">No members in this organization</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-slate-900 border-b border-slate-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Email</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Role</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Status</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {orgMembers.map(member => (
                        <tr key={member.id || member.user_id} className="hover:bg-slate-800/30 transition">
                          <td className="px-6 py-4 text-white">{member.email}</td>
                          <td className="px-6 py-4 text-slate-400 text-sm">{member.role || '—'}</td>
                          <td className="px-6 py-4 text-sm">
                            <span className={`px-2 py-1 rounded ${
                              member.pending_invite ? 'bg-yellow-900/30 text-yellow-300' : 'bg-emerald-900/30 text-emerald-300'
                            }`}>
                              {member.pending_invite ? 'Pending' : 'Active'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {!member.pending_invite && (
                              <button
                                onClick={() => removeMember(member.user_id || member.id)}
                                className="text-red-400 hover:text-red-300 text-sm"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white">System Settings</h2>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">API Configuration</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">MightyCall API Key</label>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                          placeholder="••••••••••••••••"
                          disabled
                        />
                        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium">
                          Update
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Organization Settings</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Organization</label>
                      <select className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white">
                        {orgs.map(org => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">SLA Answer Target (%)</label>
                      <input
                        type="number"
                        defaultValue="90"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">SLA Answer Target (Seconds)</label>
                      <input
                        type="number"
                        defaultValue="30"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                      />
                    </div>
                    <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium">
                      Save Settings
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default AdminDashboardPage;
