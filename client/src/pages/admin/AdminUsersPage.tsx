import type { FC } from "react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { API_BASE_URL, buildApiUrl } from "../../config";
import { supabase } from "../../lib/supabaseClient";
import PlatformApiKeysTab from '../../components/PlatformApiKeysTab';

interface Org {
  id: string;
  name: string;
}

interface AuthUser {
  id: string;
  email: string;
  role?: string | null;
  org_id?: string | null;
}

interface OrgUser {
  org_id: string;
  user_id: string;
  role: string;
  mightycall_extension?: string | null;
  created_at: string;
}

type TabType = "all" | "agents";

export const AdminUsersPage: FC = () => {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const toast = (() => {
    try {
      return useToast();
    } catch (e) {
      return null as any;
    }
  })();

  // Left panel: Create new user form
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createOrgId, setCreateOrgId] = useState("");
  const [createRole, setCreateRole] = useState("agent");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  // Assign existing user state
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState("agent");
  const [assignExtension, setAssignExtension] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignOrgId, setAssignOrgId] = useState("");
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Organizations
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);

  // Auth users list
  const [allUsers, setAllUsers] = useState<AuthUser[]>([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [currentGlobalRole, setCurrentGlobalRole] = useState<string | null>(null);

  // Tab state for right panel
  const [tab, setTab] = useState<TabType>("all");

  // Org users for filtering
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [orgUsersLoading, setOrgUsersLoading] = useState(false);

  // Edit states
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editExtension, setEditExtension] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Platform perms modal state
  const [showPlatformModal, setShowPlatformModal] = useState<{ userId: string; email: string } | null>(null);

  // Load organizations (via server API to avoid client-side Supabase usage)
  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/admin/orgs'), { cache: 'no-store', headers: { 'x-user-id': user?.id || '' } });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error('Failed to fetch orgs from API:', j);
          setOrgs([]);
          return;
        }
        const data = j.orgs || [];
        setOrgs(data.map((o: any) => ({ id: o.id, name: o.name })));
        if (data && data.length > 0) {
          setCreateOrgId(data[0].id);
        }
      } catch (err: any) {
        console.error('Failed to fetch orgs:', err);
      } finally {
        setOrgsLoading(false);
      }
    };
    fetchOrgs();
  }, []);

  // Load all auth users
  useEffect(() => {
    const fetchAuthUsers = async () => {
      try {
        setAllUsersLoading(true);
        const res = await fetch(buildApiUrl('/api/admin/users'), { cache: 'no-store', headers: { 'x-user-id': user?.id || '' } });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error('Failed to fetch admin users:', json);
          throw new Error(json.detail || 'Failed to fetch admin users');
        }
        const users = json.users || [];
        setAllUsers(users.map((u: any) => ({ id: u.id, email: u.email || '', role: u.role || null, org_id: u.org_id || null })));
        // If current logged-in user's global_role is present on the server-side users list, capture it
        try {
          const me = users.find((u: any) => u.id === user?.id);
          if (me && me.global_role) setCurrentGlobalRole(me.global_role);
        } catch (e) {
          // ignore
        }
      } catch (err: any) {
        console.error('Failed to fetch auth users:', err);
      } finally {
        setAllUsersLoading(false);
      }
    };
    fetchAuthUsers();
  }, []);

  // Load org_users assignments
  const loadOrgUsers = async () => {
    try {
      setOrgUsersLoading(true);
      const res = await fetch(buildApiUrl('/api/admin/org_users'), { cache: 'no-store', headers: { 'x-user-id': user?.id || '' } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('Failed to fetch org_users:', json);
        throw new Error(json.detail || 'Failed to fetch org_users');
      }
      setOrgUsers(json.org_users || []);
    } catch (err: any) {
      console.error('Failed to fetch org_users:', err);
    } finally {
      setOrgUsersLoading(false);
    }
  };

  useEffect(() => {
    loadOrgUsers();
  }, []);

  // Handle create new user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(false);

    if (!createEmail || !createPassword || !createOrgId || !createRole) {
      setCreateError('All fields are required');
      return;
    }

    try {
      setCreateLoading(true);

      const res = await fetch(buildApiUrl('/api/admin/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({
          email: createEmail,
          password: createPassword,
          orgId: createOrgId,
          role: createRole,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.detail || 'Failed to create user');
      }

      setCreateSuccess(true);
      setCreateEmail('');
      setCreatePassword('');
      setCreateOrgId(orgs.length > 0 ? orgs[0].id : '');
      setCreateRole('agent');

      // Refresh admin users list from backend
      try {
        const r = await fetch(buildApiUrl('/api/admin/users'), { cache: 'no-store', headers: { 'x-user-id': user?.id || '' } });
        if (r.ok) {
          const j = await r.json();
          setAllUsers((j.users || []).map((u: any) => ({ id: u.id, email: u.email || '', role: u.role || null, org_id: u.org_id || null })));
        }
      } catch (e) {
        console.warn('Failed to refresh users after creation', e);
      }

      setTimeout(() => setCreateSuccess(false), 3000);
    } catch (err: any) {
      console.error('Create user error:', err);
      setCreateError(err?.message ?? 'Failed to create user');
    } finally {
      setCreateLoading(false);
    }
  };

  // Handle assign existing user to org
  const handleAssignUser = async (userId: string, orgId: string, role: string, extension?: string | null): Promise<boolean> => {
    try {
      const res = await fetch(buildApiUrl('/api/admin/org_users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({ user_id: userId, org_id: orgId, role, mightycall_extension: extension || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || 'Failed to assign user');
      }
      await loadOrgUsers();
      try { if (user && userId === user.id && refreshProfile) await refreshProfile(); } catch (e) { /* ignore */ }
      return true;
    } catch (err: any) {
      console.error('Assign error:', err);
      return false;
    }
  };

  const handleEditUser = (record: OrgUser) => {
    setEditingKey(`${record.user_id}-${record.org_id}`);
    setEditRole(record.role);
    setEditExtension(record.mightycall_extension || '');
    setEditError(null);
  };

  const handleSaveEdit = async (userId: string, orgId: string) => {
    if (!editRole) {
      setEditError('Role is required');
      return;
    }

    try {
      setEditLoading(true);
      setEditError(null);

      const res = await fetch(buildApiUrl('/api/admin/org_users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({ user_id: userId, org_id: orgId, role: editRole, mightycall_extension: editExtension || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || 'Failed to update assignment');
      }

      setEditingKey(null);
      await loadOrgUsers();
    } catch (err: any) {
      console.error('Update error:', err);
      setEditError(err?.message ?? 'Failed to update assignment');
    } finally {
      setEditLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditError(null);
  };

  const handleDeleteAssignment = async (userId: string, orgId: string) => {
    if (!window.confirm('Remove this user from this organization?')) return;

    try {
      const res = await fetch(buildApiUrl('/api/admin/org_users'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({ user_id: userId, org_id: orgId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || 'Failed to remove assignment');
      }
      await loadOrgUsers();
      try { if (user && userId === user.id && refreshProfile) await refreshProfile(); } catch (e) { /* ignore */ }
    } catch (err: any) {
      console.error('Delete error:', err);
    }
  };

  // Filter display data based on tab
  const displayUsers = tab === "all"
    ? allUsers
    : allUsers.filter(u => u.id); // agents would be filtered by org_users with role='agent'

  // Get users already assigned
  const assignedUserIds = new Set(orgUsers.map(ou => ou.user_id));
  const unassignedUsers = allUsers.filter(u => !assignedUserIds.has(u.id));

  // PlatformPermissionsModal component
  function PlatformPermissionsModal({ userId, email, onClose }: { userId: string; email: string; onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [globalRole, setGlobalRole] = useState<string | null>(null);
    const [perms, setPerms] = useState<any>({
      can_manage_phone_numbers_global: false,
      can_manage_agents_global: false,
      can_manage_orgs: false,
      can_view_billing_global: false,
    });

    useEffect(() => {
      const load = async () => {
        try {
          setLoading(true);
          const res = await fetch(buildApiUrl(`/api/admin/users/${userId}/platform-permissions`), { headers: { 'x-user-id': user?.id || '' } });
          if (!res.ok) throw new Error('Failed to load');
          const j = await res.json();
          setGlobalRole(j.global_role || null);
          setPerms({
            can_manage_phone_numbers_global: Boolean(j.permissions?.can_manage_phone_numbers_global),
            can_manage_agents_global: Boolean(j.permissions?.can_manage_agents_global),
            can_manage_orgs: Boolean(j.permissions?.can_manage_orgs),
            can_view_billing_global: Boolean(j.permissions?.can_view_billing_global),
          });
        } catch (err) {
          console.error('Failed to load platform perms', err);
        } finally {
          setLoading(false);
        }
      };
      load();
    }, [userId]);

    const save = async () => {
      try {
        setSaving(true);
        // update global role
        await fetch(buildApiUrl(`/api/admin/users/${userId}/global-role`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
          body: JSON.stringify({ globalRole }),
        });

        // update platform permissions
        await fetch(buildApiUrl(`/api/admin/users/${userId}/platform-permissions`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
          body: JSON.stringify(perms),
        });

        onClose();
        if (toast && toast.push) toast.push('Platform permissions saved', 'success');
        // refresh users list
        try { const r = await fetch(buildApiUrl('/api/admin/users'), { cache: 'no-store', headers: { 'x-user-id': user?.id || '' } }); if (r.ok) { const j = await r.json(); setAllUsers((j.users || []).map((u: any) => ({ id: u.id, email: u.email || '', role: u.role || null, org_id: u.org_id || null }))); } } catch(e){}
        // if we changed the current user's global role/permissions, refresh local profile
        try {
          if (user && userId === user.id && refreshProfile) await refreshProfile();
        } catch (e) {
          // ignore
        }
      } catch (err) {
        console.error('Failed to save platform perms', err);
        alert('Failed to save');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md bg-slate-900 rounded-lg p-5 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Platform permissions</h3>
              <p className="text-xs text-slate-400 mt-1">{email}</p>
            </div>
            <button onClick={onClose} className="text-slate-400">×</button>
          </div>

          {loading ? (
            <div className="text-xs text-slate-400">Loading...</div>
          ) : (
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Global role</label>
                <select value={globalRole || ''} onChange={(e) => setGlobalRole(e.target.value || null)} className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm">
                  <option value="">None</option>
                  <option value="platform_manager">Platform Manager</option>
                  <option value="platform_admin">Platform Admin</option>
                </select>
              </div>

              <div className="text-xs text-slate-400">Platform manager permissions</div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perms.can_manage_phone_numbers_global} onChange={() => setPerms({...perms, can_manage_phone_numbers_global: !perms.can_manage_phone_numbers_global})} /> Manage phone numbers</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perms.can_manage_agents_global} onChange={() => setPerms({...perms, can_manage_agents_global: !perms.can_manage_agents_global})} /> Manage agents</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perms.can_manage_orgs} onChange={() => setPerms({...perms, can_manage_orgs: !perms.can_manage_orgs})} /> Manage orgs</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perms.can_view_billing_global} onChange={() => setPerms({...perms, can_view_billing_global: !perms.can_view_billing_global})} /> View billing</label>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1 bg-slate-700 rounded">Cancel</button>
            <button onClick={save} disabled={saving || loading} className="px-3 py-1 bg-emerald-500 rounded">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PageLayout title="User Management">
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">User Management</h1>
            <p className="text-xs text-slate-400 mt-1">
              Create new users and manage organization assignments.
            </p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 text-sm text-slate-300 hover:text-emerald-400 transition"
          >
            ← Back
          </button>
        </header>

        <AdminTopNav />

        <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* LEFT PANEL: Create New User Form */}
          <div className="rounded-2xl bg-slate-900/80 ring-1 ring-slate-800 p-5 space-y-6 h-fit">
            {/* Create new user form */}
            <div>
              <h2 className="font-semibold text-sm mb-3">Create New User</h2>

              {createError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 mb-3">
                  {createError}
                </div>
              )}

              {createSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 mb-3">
                  User created successfully
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Organization
                  </label>
                  {orgsLoading ? (
                    <div className="text-xs text-slate-400">Loading...</div>
                  ) : (
                    <select
                      value={createOrgId}
                      onChange={(e) => setCreateOrgId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    >
                      <option value="">Select organization...</option>
                      {orgs.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Role
                  </label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  >
                    <option value="agent">Agent</option>
                    <option value="org_manager">Org Manager</option>
                    <option value="org_admin">Org Admin</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={createLoading}
                  className="w-full mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 text-white font-semibold rounded-lg text-sm transition"
                >
                  {createLoading ? 'Creating...' : 'Create User'}
                </button>
              </form>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-700" />

            {/* Assign existing user to org */}
            <div>
              <h3 className="font-semibold text-xs mb-2 text-slate-300">Or assign existing user</h3>

              <div className="space-y-3">
                  {assignSuccess && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300">
                      User assigned successfully
                    </div>
                  )}
                <div>
                  <label className="block text-xs text-slate-300 mb-1">User</label>
                  <select
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 text-sm"
                  >
                    <option value="">Select user...</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.email || u.id}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Organization</label>
                  <select
                    value={assignOrgId}
                    onChange={(e) => setAssignOrgId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 text-sm"
                  >
                    <option value="">Select organization...</option>
                    {orgs.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Role</label>
                  <select
                    value={assignRole}
                    onChange={(e) => setAssignRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 text-sm"
                  >
                    <option value="agent">Agent</option>
                    <option value="org_manager">Org Manager</option>
                    <option value="org_admin">Org Admin</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">MightyCall Extension (optional)</label>
                  <input
                    type="text"
                    value={assignExtension}
                    onChange={(e) => setAssignExtension(e.target.value)}
                    placeholder="e.g. 101"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 placeholder-slate-600 text-sm"
                  />
                </div>

                <div>
                  <button
                    onClick={async () => {
                      if (!assignUserId || !assignOrgId || !assignRole) {
                        alert('Please select user, org and role');
                        return;
                      }
                      setAssignLoading(true);
                      const ok = await handleAssignUser(assignUserId, assignOrgId, assignRole, assignExtension || null);
                      setAssignLoading(false);
                                      if (ok) {
                                        setAssignSuccess(true);
                                        setAssignUserId('');
                                        setAssignExtension('');
                                        setAssignOrgId('');
                                        if (toast && toast.push) toast.push('User assigned', 'success');
                                        setTimeout(() => setAssignSuccess(false), 3000);
                                      } else {
                                        alert('Failed to assign user');
                                      }
                    }}
                    className="w-full mt-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 text-white font-semibold rounded-lg text-sm"
                    disabled={assignLoading}
                  >
                    {assignLoading ? 'Assigning...' : 'Assign User'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Users list with tabs */}
          <div className="rounded-2xl bg-slate-900/80 ring-1 ring-slate-800 p-5 overflow-hidden">
            {/* Tabs */}
            <div className="flex gap-2 mb-4 border-b border-slate-700 pb-3">
              <button
                onClick={() => setTab("all")}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition ${
                  tab === "all"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/50"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                All Users
              </button>
              <button
                onClick={() => setTab("agents")}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition ${
                  tab === "agents"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/50"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                Agents
              </button>
            </div>

            {/* Users table */}
            {allUsersLoading || orgUsersLoading ? (
              <div className="text-xs text-slate-400 text-center py-8">
                Loading...
              </div>
            ) : tab === "all" ? (
              // All users list
              <div className="space-y-2">
                <div className="text-xs text-slate-400 mb-3">
                  {unassignedUsers.length} unassigned user{unassignedUsers.length !== 1 ? 's' : ''}
                </div>

                {unassignedUsers.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-4">
                    All users are assigned
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {unassignedUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 rounded-lg p-3 transition"
                      >
                        <div>
                          <div className="text-xs font-medium text-slate-200">{user.email}</div>
                          <div className="text-[10px] text-slate-500">{user.id.slice(0, 8)}...</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowPlatformModal({ userId: user.id, email: user.email })}
                            className="text-xs text-emerald-400 hover:underline"
                          >
                            Platform
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Assignments table */}
                {orgUsers.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-semibold text-xs mb-3 text-slate-300">Assignments</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Email
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Organization
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Role
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-300">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {orgUsers.map((record) => {
                            const user = allUsers.find((u) => u.id === record.user_id);
                            const org = orgs.find((o) => o.id === record.org_id);
                            const key = `${record.user_id}-${record.org_id}`;
                            const isEditing = editingKey === key;

                            if (isEditing) {
                              return (
                                <tr
                                  key={key}
                                  className="border-b border-slate-800 bg-slate-800/30"
                                >
                                  <td className="px-3 py-2 text-slate-200">
                                    {user?.email || record.user_id}
                                  </td>
                                  <td className="px-3 py-2 text-slate-400">
                                    {org?.name || record.org_id}
                                  </td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={editRole}
                                      onChange={(e) => setEditRole(e.target.value)}
                                      className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200"
                                    >
                                      <option value="agent">Agent</option>
                                      <option value="org_manager">Org Manager</option>
                                      <option value="org_admin">Org Admin</option>
                                      <option value="admin">Admin</option>
                                    </select>
                                  </td>
                                  <td className="px-3 py-2 text-right space-x-2">
                                    <button
                                      onClick={() => handleSaveEdit(record.user_id, record.org_id)}
                                      disabled={editLoading}
                                      className="text-xs text-emerald-400 hover:text-emerald-300 disabled:text-slate-600 underline underline-offset-2"
                                    >
                                      {editLoading ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      onClick={handleCancelEdit}
                                      disabled={editLoading}
                                      className="text-xs text-slate-400 hover:text-slate-300 disabled:text-slate-600 underline underline-offset-2"
                                    >
                                      Cancel
                                    </button>
                                  </td>
                                </tr>
                              );
                            }

                            return (
                              <tr
                                key={key}
                                className="border-b border-slate-800 hover:bg-slate-800/50 transition"
                              >
                                <td className="px-3 py-2 text-slate-200">
                                  {user?.email || record.user_id}
                                </td>
                                <td className="px-3 py-2 text-slate-400">
                                  {org?.name || record.org_id}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="px-2 py-1 bg-slate-700/50 rounded text-slate-300 text-xs">
                                    {record.role}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right space-x-2">
                                  <button
                                    onClick={() => handleEditUser(record)}
                                    className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAssignment(record.user_id, record.org_id)}
                                    className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2"
                                  >
                                    Remove
                                  </button>
                                  <button
                                    onClick={() => setShowPlatformModal({ userId: record.user_id, email: user?.email || record.user_id })}
                                    className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                                  >
                                    Platform
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {editError && (
                      <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                        {editError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              // Agents list
              <div>
                <div className="text-xs text-slate-400 mb-3">
                  Agents with assigned organizations
                </div>
                {orgUsersLoading ? (
                  <div>Loading...</div>
                ) : orgUsers.filter(ou => ou.role === 'agent').length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-8">
                    No agents yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="px-3 py-2 text-left font-semibold text-slate-300">
                            Email
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-300">
                            Organization
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-300">
                            Extension
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-300">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {orgUsers
                          .filter(ou => ou.role === 'agent')
                          .map((record) => {
                            const user = allUsers.find((u) => u.id === record.user_id);
                            const org = orgs.find((o) => o.id === record.org_id);
                            const key = `${record.user_id}-${record.org_id}`;

                            return (
                              <tr
                                key={key}
                                className="border-b border-slate-800 hover:bg-slate-800/50 transition"
                              >
                                <td className="px-3 py-2 text-slate-200">
                                  {user?.email || record.user_id}
                                </td>
                                <td className="px-3 py-2 text-slate-400">
                                  {org?.name || record.org_id}
                                </td>
                                <td className="px-3 py-2 text-slate-400">
                                  {record.mightycall_extension || '—'}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    onClick={() => handleDeleteAssignment(record.user_id, record.org_id)}
                                    className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {showPlatformModal && (
          <PlatformPermissionsModal
            userId={showPlatformModal.userId}
            email={showPlatformModal.email}
            onClose={() => setShowPlatformModal(null)}
          />
        )}
      </div>
    </PageLayout>
  );
};
