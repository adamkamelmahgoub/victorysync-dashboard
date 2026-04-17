import React, { FC, useEffect, useMemo, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';
import { cleanupOrgMightyCallExtensions, getAdminMightyCallExtensions, getLiveAgentStatus, getOrgMightyCallExtensions } from '../../lib/apiClient';

type Org = { id: string; name: string };
type AuthUser = { id: string; email: string; role?: string | null };
type OrgUser = {
  org_id: string;
  user_id: string;
  role: string;
  mightycall_extension?: string | null;
  created_at?: string;
};
type ExtensionOption = {
  extension: string;
  display_name?: string | null;
  sources?: string[];
  is_live?: boolean;
  source_org_id?: string | null;
  source_org_name?: string | null;
};
type LiveAgentStatus = {
  user_id: string;
  org_id?: string | null;
  email?: string | null;
  extension?: string | null;
  display_name?: string | null;
  on_call: boolean;
  counterpart?: string | null;
  status?: string | null;
  started_at?: string | null;
};

function fmtDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

const MANAGED_ROLES = ['agent', 'org_manager'];

const AdminAgentsManagementPage: FC = () => {
  const { user, selectedOrgId, orgs: authOrgs } = useAuth();
  const userId = user?.id || '';

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [assignments, setAssignments] = useState<OrgUser[]>([]);
  const [liveStatuses, setLiveStatuses] = useState<LiveAgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const [createUserId, setCreateUserId] = useState('');
  const [createOrgId, setCreateOrgId] = useState('');
  const [createRole, setCreateRole] = useState('agent');
  const [createExtension, setCreateExtension] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('agent');
  const [editExtension, setEditExtension] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [extensionOptionsByOrg, setExtensionOptionsByOrg] = useState<Record<string, ExtensionOption[]>>({});
  const [hiddenExtensionOptionsByOrg, setHiddenExtensionOptionsByOrg] = useState<Record<string, ExtensionOption[]>>({});
  const [extensionsLoadingByOrg, setExtensionsLoadingByOrg] = useState<Record<string, boolean>>({});
  const [extensionsErrorByOrg, setExtensionsErrorByOrg] = useState<Record<string, string | null>>({});
  const [extensionsInfoByOrg, setExtensionsInfoByOrg] = useState<Record<string, string | null>>({});
  const [cleanupLoadingByOrg, setCleanupLoadingByOrg] = useState<Record<string, boolean>>({});
  const [cleanupSummary, setCleanupSummary] = useState<string | null>(null);
  const [globalExtensionOptions, setGlobalExtensionOptions] = useState<ExtensionOption[]>([]);
  const [globalExtensionsLoading, setGlobalExtensionsLoading] = useState(false);
  const [globalExtensionsError, setGlobalExtensionsError] = useState<string | null>(null);
  const [globalExtensionsInfo, setGlobalExtensionsInfo] = useState<string | null>(null);

  const activeOrgId = selectedOrgId || '';

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of orgs) map.set(org.id, org.name);
    for (const org of authOrgs) map.set(org.id, org.name);
    return map;
  }, [orgs, authOrgs]);

  const userEmailById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of users) map.set(item.id, item.email);
    return map;
  }, [users]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((row) => {
      if (!MANAGED_ROLES.includes(String(row.role || ''))) return false;
      if (activeOrgId && row.org_id !== activeOrgId) return false;
      return true;
    });
  }, [assignments, activeOrgId]);

  const unassignedUsers = useMemo(() => {
    return users.filter((row) => row.email);
  }, [users]);

  const liveStatusByAssignment = useMemo(() => {
    const map = new Map<string, LiveAgentStatus>();
    for (const item of liveStatuses) {
      map.set(`${item.org_id || ''}:${item.user_id}`, item);
    }
    return map;
  }, [liveStatuses]);

  const loadExtensionsForOrg = async (orgId: string) => {
    if (!orgId) return;
    if (extensionOptionsByOrg[orgId]?.length) return;
    setExtensionsLoadingByOrg((prev) => ({ ...prev, [orgId]: true }));
    setExtensionsErrorByOrg((prev) => ({ ...prev, [orgId]: null }));
    setExtensionsInfoByOrg((prev) => ({ ...prev, [orgId]: null }));
    try {
      const json = await getOrgMightyCallExtensions(orgId, userId, { liveOnly: true });
      const liveOptions = json.extensions || [];
      const fallbackOptions = json.fallback_extensions || [];
      setExtensionOptionsByOrg((prev) => ({ ...prev, [orgId]: liveOptions }));
      setHiddenExtensionOptionsByOrg((prev) => ({ ...prev, [orgId]: json.hidden_extensions || [] }));
      if (!json.live_fetch_ok) {
        setExtensionsErrorByOrg((prev) => ({ ...prev, [orgId]: json.live_fetch_error || 'MightyCall live extensions could not be loaded' }));
      } else if (!liveOptions.length && fallbackOptions.length) {
        setExtensionsInfoByOrg((prev) => ({ ...prev, [orgId]: 'Saved org extensions exist, but MightyCall did not verify them yet, so they are hidden.' }));
      } else if (!liveOptions.length) {
        setExtensionsErrorByOrg((prev) => ({ ...prev, [orgId]: 'MightyCall returned no live extensions for this org.' }));
      }
    } finally {
      setExtensionsLoadingByOrg((prev) => ({ ...prev, [orgId]: false }));
    }
  };

  const refreshExtensionsForOrg = async (orgId: string) => {
    if (!orgId) return;
    setExtensionsLoadingByOrg((prev) => ({ ...prev, [orgId]: true }));
    setExtensionsErrorByOrg((prev) => ({ ...prev, [orgId]: null }));
    setExtensionsInfoByOrg((prev) => ({ ...prev, [orgId]: null }));
    try {
      const json = await getOrgMightyCallExtensions(orgId, userId, { liveOnly: true });
      const liveOptions = json.extensions || [];
      const fallbackOptions = json.fallback_extensions || [];
      setExtensionOptionsByOrg((prev) => ({ ...prev, [orgId]: liveOptions }));
      setHiddenExtensionOptionsByOrg((prev) => ({ ...prev, [orgId]: json.hidden_extensions || [] }));
      if (!json.live_fetch_ok) {
        setExtensionsErrorByOrg((prev) => ({ ...prev, [orgId]: json.live_fetch_error || 'MightyCall live extensions could not be loaded' }));
      } else if (!liveOptions.length && fallbackOptions.length) {
        setExtensionsInfoByOrg((prev) => ({ ...prev, [orgId]: 'Saved org extensions exist, but MightyCall did not verify them yet, so they are hidden.' }));
      } else if (!liveOptions.length) {
        setExtensionsErrorByOrg((prev) => ({ ...prev, [orgId]: 'MightyCall returned no live extensions for this org.' }));
      }
    } catch (e: any) {
      setExtensionsErrorByOrg((prev) => ({ ...prev, [orgId]: e?.message || 'Failed to load MightyCall extensions' }));
    } finally {
      setExtensionsLoadingByOrg((prev) => ({ ...prev, [orgId]: false }));
    }
  };

  const loadGlobalExtensions = async () => {
    if (!userId) return;
    setGlobalExtensionsLoading(true);
    setGlobalExtensionsError(null);
    setGlobalExtensionsInfo(null);
    setGlobalExtensionOptions([]);
    try {
      const json = await getAdminMightyCallExtensions(userId, { liveOnly: true });
      const liveOptions = (json.live_extensions || []) as ExtensionOption[];
      const fallbackOptions = (json.fallback_extensions || []) as ExtensionOption[];
      setGlobalExtensionOptions(liveOptions);
      if (!liveOptions.length && fallbackOptions.length) {
        setGlobalExtensionsInfo('Saved extensions exist, but MightyCall did not verify them yet, so they are hidden.');
      } else if (!liveOptions.length) {
        setGlobalExtensionsError('No MightyCall extensions were found across any org.');
      }
    } catch (e: any) {
      setGlobalExtensionOptions([]);
      setGlobalExtensionsError(e?.message || 'Failed to load global MightyCall extensions');
    } finally {
      setGlobalExtensionsLoading(false);
    }
  };

  const handleCleanupExtensions = async () => {
    if (!activeOrgId) {
      setError('Select an organization first to clean stale extensions');
      return;
    }
    if (!window.confirm('Remove stale saved extensions for this org that are not currently live in MightyCall?')) return;
    try {
      setCleanupLoadingByOrg((prev) => ({ ...prev, [activeOrgId]: true }));
      setError(null);
      setCleanupSummary(null);
      const json = await cleanupOrgMightyCallExtensions(activeOrgId, userId);
      const removedCount = (json.removed_agent_extensions || []).length;
      const clearedCount = (json.cleared_org_user_extensions || []).length;
      setCleanupSummary(`Removed ${removedCount} stale agent extension assignment${removedCount === 1 ? '' : 's'} and cleared ${clearedCount} stale org member extension${clearedCount === 1 ? '' : 's'} for ${orgNameById.get(activeOrgId) || activeOrgId}.`);
      await Promise.all([
        loadBaseData(),
        loadLiveStatuses(),
        refreshExtensionsForOrg(activeOrgId)
      ]);
    } catch (e: any) {
      setError(e?.message || 'Failed to clean stale MightyCall extensions');
    } finally {
      setCleanupLoadingByOrg((prev) => ({ ...prev, [activeOrgId]: false }));
    }
  };

  const loadBaseData = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      const [orgRes, userRes, assignmentRes] = await Promise.all([
        fetch(buildApiUrl('/api/admin/orgs'), { headers: { 'x-user-id': userId } }),
        fetch(buildApiUrl('/api/admin/users'), { headers: { 'x-user-id': userId } }),
        fetch(buildApiUrl('/api/admin/org_users'), { headers: { 'x-user-id': userId } })
      ]);

      const [orgJson, userJson, assignmentJson] = await Promise.all([
        orgRes.json().catch(() => ({})),
        userRes.json().catch(() => ({})),
        assignmentRes.json().catch(() => ({}))
      ]);

      if (!orgRes.ok) throw new Error(orgJson.detail || 'Failed to load organizations');
      if (!userRes.ok) throw new Error(userJson.detail || 'Failed to load users');
      if (!assignmentRes.ok) throw new Error(assignmentJson.detail || 'Failed to load assignments');

      setOrgs(orgJson.orgs || []);
      setUsers((userJson.users || []).map((row: any) => ({
        id: row.id,
        email: row.email || '',
        role: row.role || null
      })));
      setAssignments(assignmentJson.org_users || []);
      if (!createOrgId) {
        setCreateOrgId(activeOrgId || orgJson.orgs?.[0]?.id || '');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load agent management data');
    } finally {
      setLoading(false);
    }
  };

  const loadLiveStatuses = async () => {
    if (!userId) return;
    try {
      setLiveLoading(true);
      setLiveError(null);
      const json = await getLiveAgentStatus({ orgId: activeOrgId || null }, userId);
      setLiveStatuses(json.items || []);
      setRefreshedAt(json.refreshed_at || new Date().toISOString());
    } catch (e: any) {
      setLiveError(e?.message || 'Failed to load live agent status');
    } finally {
      setLiveLoading(false);
    }
  };

  useEffect(() => {
    loadBaseData();
  }, [userId]);

  useEffect(() => {
    loadGlobalExtensions();
  }, [userId]);

  useEffect(() => {
    loadLiveStatuses();
  }, [userId, activeOrgId]);

  useEffect(() => {
    if (createOrgId) loadExtensionsForOrg(createOrgId);
  }, [createOrgId]);

  useEffect(() => {
    if (activeOrgId) {
      setCreateOrgId(activeOrgId);
    }
  }, [activeOrgId]);

  const createExtensionOptions = createOrgId ? (extensionOptionsByOrg[createOrgId] || []) : globalExtensionOptions;
  const detailOrgId = activeOrgId || createOrgId;
  const activeOrgHiddenExtensions = hiddenExtensionOptionsByOrg[detailOrgId] || [];
  const activeOrgExtensionsError = extensionsErrorByOrg[detailOrgId] || null;
  const activeOrgExtensionsInfo = extensionsInfoByOrg[detailOrgId] || null;

  const handleCreateAssignment = async () => {
    if (!createUserId || !createOrgId || !createRole) {
      setError('User, organization, and role are required');
      return;
    }
    try {
      setSavingCreate(true);
      setError(null);
      const res = await fetch(buildApiUrl('/api/admin/org_users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({
          user_id: createUserId,
          org_id: createOrgId,
          role: createRole,
          mightycall_extension: createExtension || null
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || 'Failed to create assignment');
      setCreateUserId('');
      setCreateExtension('');
      await loadBaseData();
      await loadLiveStatuses();
    } catch (e: any) {
      setError(e?.message || 'Failed to create assignment');
    } finally {
      setSavingCreate(false);
    }
  };

  const startEditing = async (row: OrgUser) => {
    setEditingKey(`${row.user_id}:${row.org_id}`);
    setEditRole(row.role);
    setEditExtension(row.mightycall_extension || '');
    await loadExtensionsForOrg(row.org_id);
  };

  const saveEdit = async (row: OrgUser) => {
    try {
      setSavingEdit(true);
      setError(null);
      const res = await fetch(buildApiUrl('/api/admin/org_users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({
          user_id: row.user_id,
          org_id: row.org_id,
          role: editRole,
          mightycall_extension: editExtension || null
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || 'Failed to update assignment');
      setEditingKey(null);
      await loadBaseData();
      await loadLiveStatuses();
    } catch (e: any) {
      setError(e?.message || 'Failed to update assignment');
    } finally {
      setSavingEdit(false);
    }
  };

  const removeAssignment = async (row: OrgUser) => {
    if (!window.confirm('Remove this agent assignment?')) return;
    try {
      const res = await fetch(buildApiUrl('/api/admin/org_users'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ user_id: row.user_id, org_id: row.org_id })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || 'Failed to remove assignment');
      await loadBaseData();
      await loadLiveStatuses();
    } catch (e: any) {
      setError(e?.message || 'Failed to remove assignment');
    }
  };

  return (
    <PageLayout title="Agent Management" description="Dedicated admin tools for agent assignments, extensions, and live status">
      <div className="space-y-6">
        <AdminTopNav />

        <section className="vs-surface p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Create Assignment</h2>
              <p className="text-sm text-slate-400 mt-1">Assign users to organizations as agents or managers with a MightyCall extension.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  loadGlobalExtensions();
                  if (activeOrgId || createOrgId) refreshExtensionsForOrg(activeOrgId || createOrgId);
                }}
                disabled={(globalExtensionsLoading || extensionsLoadingByOrg[activeOrgId || createOrgId]) || !(activeOrgId || createOrgId)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-cyan-500 hover:text-cyan-300 disabled:opacity-50"
              >
                {(globalExtensionsLoading || extensionsLoadingByOrg[activeOrgId || createOrgId]) ? 'Refreshing extensions...' : 'Refresh Extensions'}
              </button>
              <button
                onClick={handleCleanupExtensions}
                disabled={cleanupLoadingByOrg[activeOrgId] || !activeOrgId}
                className="rounded-lg border border-amber-700 bg-slate-900 px-4 py-2 text-sm text-amber-200 hover:border-amber-500 hover:text-amber-100 disabled:opacity-50"
              >
                {cleanupLoadingByOrg[activeOrgId] ? 'Cleaning...' : 'Clean Stale Extensions'}
              </button>
              <button
                onClick={loadLiveStatuses}
                disabled={liveLoading}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-cyan-500 hover:text-cyan-300 disabled:opacity-50"
              >
                {liveLoading ? 'Refreshing live...' : 'Refresh Live Status'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-5">
            <select value={createUserId} onChange={(e) => setCreateUserId(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
              <option value="">Select user</option>
              {unassignedUsers.map((row) => (
                <option key={row.id} value={row.id}>{row.email}</option>
              ))}
            </select>
            <select value={createOrgId} onChange={(e) => setCreateOrgId(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
              <option value="">Select org</option>
              {orgs.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
            <select value={createRole} onChange={(e) => setCreateRole(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
              <option value="agent">Agent</option>
              <option value="org_manager">Org Manager</option>
            </select>
            <select value={createExtension} onChange={(e) => setCreateExtension(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
              <option value="">{(globalExtensionsLoading || extensionsLoadingByOrg[createOrgId]) ? 'Loading extensions...' : 'Select extension'}</option>
              {createExtensionOptions.map((option) => (
                <option key={`${option.source_org_id || 'global'}:${option.extension}`} value={option.extension}>
                  {option.display_name ? `${option.extension} - ${option.display_name}` : option.extension}
                  {option.source_org_name ? ` (${option.source_org_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <button
              onClick={handleCreateAssignment}
              disabled={savingCreate}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {savingCreate ? 'Saving...' : 'Add Agent Assignment'}
            </button>
          </div>

          {(cleanupSummary || globalExtensionsError || globalExtensionsInfo || activeOrgExtensionsError || activeOrgExtensionsInfo || activeOrgHiddenExtensions.length > 0) && (
            <div className="mt-4 space-y-2">
              {cleanupSummary && (
                <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{cleanupSummary}</div>
              )}
              {globalExtensionsInfo && (
                <div className="rounded-lg border border-cyan-700/60 bg-cyan-950/30 px-4 py-3 text-sm text-cyan-300">{globalExtensionsInfo}</div>
              )}
              {globalExtensionsError && (
                <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">{globalExtensionsError}</div>
              )}
              {activeOrgExtensionsInfo && (
                <div className="rounded-lg border border-cyan-700/60 bg-cyan-950/30 px-4 py-3 text-sm text-cyan-300">{activeOrgExtensionsInfo}</div>
              )}
              {activeOrgExtensionsError && (
                <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">{activeOrgExtensionsError}</div>
              )}
              {activeOrgHiddenExtensions.length > 0 && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3">
                  <div className="text-sm font-medium text-slate-200">Hidden stale extensions</div>
                  <div className="mt-1 text-xs text-slate-400">These were saved in the database but are not currently live in MightyCall, so they are excluded from the dropdown.</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeOrgHiddenExtensions.map((option) => (
                      <span key={option.extension} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
                        {option.display_name ? `${option.extension} - ${option.display_name}` : option.extension}
                        {option.sources?.length ? ` (${option.sources.join(', ')})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {(error || liveError) && (
          <section className="space-y-2">
            {error && <div className="rounded-lg border border-rose-700/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">{error}</div>}
            {liveError && <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">{liveError}</div>}
          </section>
        )}

        <section className="vs-surface p-0 overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-200">Agent Assignments</div>
            <div className="text-xs text-slate-400">
              {refreshedAt ? `Live status updated ${fmtDate(refreshedAt)}` : 'Live status not loaded yet'}
            </div>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-sm text-slate-400">Loading assignments...</div>
          ) : filteredAssignments.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-400">No agent assignments found.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="text-left py-2 px-3">User</th>
                    <th className="text-left py-2 px-3">Org</th>
                    <th className="text-left py-2 px-3">Role</th>
                    <th className="text-left py-2 px-3">Extension</th>
                    <th className="text-left py-2 px-3">Live</th>
                    <th className="text-left py-2 px-3">On Call With</th>
                    <th className="text-left py-2 px-3">Started</th>
                    <th className="text-left py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredAssignments.map((row) => {
                    const key = `${row.user_id}:${row.org_id}`;
                    const isEditing = editingKey === key;
                    const live = liveStatusByAssignment.get(`${row.org_id}:${row.user_id}`);
                    const options = row.org_id ? (extensionOptionsByOrg[row.org_id] || []) : globalExtensionOptions;

                    return (
                      <tr key={key}>
                        <td className="py-2 px-3 text-slate-200">{userEmailById.get(row.user_id) || row.user_id}</td>
                        <td className="py-2 px-3 text-slate-300">{orgNameById.get(row.org_id) || row.org_id}</td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
                              <option value="agent">Agent</option>
                              <option value="org_manager">Org Manager</option>
                            </select>
                          ) : (
                            <span className="text-slate-200">{row.role}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <select value={editExtension} onChange={(e) => setEditExtension(e.target.value)} className="min-w-[180px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
                              <option value="">{(globalExtensionsLoading || extensionsLoadingByOrg[row.org_id]) ? 'Loading extensions...' : 'Select extension'}</option>
                              {options.map((option) => (
                                <option key={`${option.source_org_id || row.org_id}:${option.extension}`} value={option.extension}>
                                  {option.display_name ? `${option.extension} - ${option.display_name}` : option.extension}
                                  {option.source_org_name ? ` (${option.source_org_name})` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-300">{row.mightycall_extension || '-'}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                            live?.on_call ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {live?.on_call ? 'On Call' : (live?.status || 'Idle')}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-300 break-words">{live?.counterpart || '-'}</td>
                        <td className="py-2 px-3 text-slate-400">{fmtDate(live?.started_at)}</td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button onClick={() => saveEdit(row)} disabled={savingEdit} className="rounded bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">Save</button>
                              <button onClick={() => setEditingKey(null)} className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => startEditing(row)} className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800">Edit</button>
                              <button onClick={() => removeAssignment(row)} className="rounded border border-rose-800 px-3 py-1 text-xs text-rose-300 hover:bg-rose-950/30">Remove</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PageLayout>
  );
};

export default AdminAgentsManagementPage;
