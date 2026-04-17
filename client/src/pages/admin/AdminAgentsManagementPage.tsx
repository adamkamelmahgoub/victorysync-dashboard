import React, { FC, useEffect, useMemo, useState } from 'react';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';
import { cleanupOrgMightyCallExtensions, getAdminMightyCallExtensions, getLiveAgentStatus, getOrgMightyCallExtensions, getVerifiedAdminMightyCallExtensions, importAdminMightyCallExtension } from '../../lib/apiClient';

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

function statTone(kind: 'default' | 'success' | 'warning' | 'accent') {
  if (kind === 'success') return 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10';
  if (kind === 'warning') return 'text-amber-300 border-amber-500/20 bg-amber-500/10';
  if (kind === 'accent') return 'text-cyan-300 border-cyan-500/20 bg-cyan-500/10';
  return 'text-slate-200 border-white/10 bg-white/[0.03]';
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
  const [manualExtension, setManualExtension] = useState('');
  const [manualImportLoading, setManualImportLoading] = useState(false);
  const [manualImportMessage, setManualImportMessage] = useState<string | null>(null);

  const activeOrgId = selectedOrgId || '';
  const surfaceClass = 'rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(8,15,30,0.96))] shadow-[0_24px_80px_rgba(2,8,23,0.45)] backdrop-blur';

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

  const summary = useMemo(() => {
    const agents = filteredAssignments.filter((row) => row.role === 'agent').length;
    const managers = filteredAssignments.filter((row) => row.role === 'org_manager').length;
    const onCall = filteredAssignments.filter((row) => liveStatusByAssignment.get(`${row.org_id}:${row.user_id}`)?.on_call).length;
    const assignedExtensions = filteredAssignments.filter((row) => String(row.mightycall_extension || '').trim()).length;
    return { agents, managers, onCall, assignedExtensions, total: filteredAssignments.length };
  }, [filteredAssignments, liveStatusByAssignment]);

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
      let nextOptions = liveOptions;
      if (!nextOptions.length) {
        const verifiedJson = await getVerifiedAdminMightyCallExtensions(userId);
        nextOptions = (verifiedJson.extensions || []) as ExtensionOption[];
      }
      setGlobalExtensionOptions(nextOptions);
      if (!liveOptions.length && fallbackOptions.length) {
        setGlobalExtensionsInfo('Saved extensions exist, but MightyCall did not verify them yet, so they are hidden.');
      } else if (!nextOptions.length) {
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

  const handleManualImport = async () => {
    const nextExtension = manualExtension.trim();
    if (!nextExtension) {
      setError('Enter an extension to import from MightyCall');
      return;
    }
    try {
      setManualImportLoading(true);
      setError(null);
      setManualImportMessage(null);
      const json = await importAdminMightyCallExtension(nextExtension, createOrgId || activeOrgId || null, userId);
      const imported = json?.extension as ExtensionOption | undefined;
      setManualExtension('');
      setManualImportMessage(`Imported extension ${nextExtension} from MightyCall.`);
      if (imported?.extension) {
        setGlobalExtensionOptions((prev) => {
          const next = [...prev];
          if (!next.some((item) => item.extension === imported.extension)) {
            next.push(imported);
          }
          return next.sort((a, b) => String(a.extension || '').localeCompare(String(b.extension || '')));
        });
        if (createOrgId) {
          setExtensionOptionsByOrg((prev) => {
            const current = prev[createOrgId] || [];
            if (current.some((item) => item.extension === imported.extension)) return prev;
            return {
              ...prev,
              [createOrgId]: [...current, imported].sort((a, b) => String(a.extension || '').localeCompare(String(b.extension || '')))
            };
          });
        }
      }
      await Promise.all([
        loadGlobalExtensions(),
        createOrgId ? refreshExtensionsForOrg(createOrgId) : Promise.resolve()
      ]);
    } catch (e: any) {
      setError(e?.message || `Failed to import extension ${nextExtension} from MightyCall`);
    } finally {
      setManualImportLoading(false);
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

  const createExtensionOptions = globalExtensionOptions;
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

        <section className={`${surfaceClass} overflow-hidden`}>
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_28%)] px-6 py-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                  Agent Operations
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">Assignments, extensions, and live status in one place</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                  Manage agent coverage, import real MightyCall extensions, and watch who is active right now without bouncing between separate tools.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[520px]">
                <div className={`rounded-2xl border px-4 py-4 ${statTone('default')}`}>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Assignments</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{summary.total}</div>
                </div>
                <div className={`rounded-2xl border px-4 py-4 ${statTone('accent')}`}>
                  <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/70">On Call</div>
                  <div className="mt-2 text-2xl font-semibold text-cyan-200">{summary.onCall}</div>
                </div>
                <div className={`rounded-2xl border px-4 py-4 ${statTone('success')}`}>
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-200/70">Agents</div>
                  <div className="mt-2 text-2xl font-semibold text-emerald-200">{summary.agents}</div>
                </div>
                <div className={`rounded-2xl border px-4 py-4 ${statTone('warning')}`}>
                  <div className="text-xs uppercase tracking-[0.18em] text-amber-200/70">Extensions</div>
                  <div className="mt-2 text-2xl font-semibold text-amber-200">{summary.assignedExtensions}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Create Assignment</h2>
              <p className="mt-1 text-sm text-slate-400">Assign users to organizations as agents or managers with a MightyCall extension.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  loadGlobalExtensions();
                  if (activeOrgId || createOrgId) refreshExtensionsForOrg(activeOrgId || createOrgId);
                }}
                disabled={(globalExtensionsLoading || extensionsLoadingByOrg[activeOrgId || createOrgId]) || !(activeOrgId || createOrgId)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-200 disabled:opacity-50"
              >
                {(globalExtensionsLoading || extensionsLoadingByOrg[activeOrgId || createOrgId]) ? 'Refreshing extensions...' : 'Refresh Extensions'}
              </button>
              <button
                onClick={handleCleanupExtensions}
                disabled={cleanupLoadingByOrg[activeOrgId] || !activeOrgId}
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-500/15 disabled:opacity-50"
              >
                {cleanupLoadingByOrg[activeOrgId] ? 'Cleaning...' : 'Clean Stale Extensions'}
              </button>
              <button
                onClick={loadLiveStatuses}
                disabled={liveLoading}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-200 disabled:opacity-50"
              >
                {liveLoading ? 'Refreshing live...' : 'Refresh Live Status'}
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
            <select value={createUserId} onChange={(e) => setCreateUserId(e.target.value)} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50 focus:bg-slate-900">
              <option value="">Select user</option>
              {unassignedUsers.map((row) => (
                <option key={row.id} value={row.id}>{row.email}</option>
              ))}
            </select>
            <select value={createOrgId} onChange={(e) => setCreateOrgId(e.target.value)} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50 focus:bg-slate-900">
              <option value="">Select org</option>
              {orgs.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
            <select value={createRole} onChange={(e) => setCreateRole(e.target.value)} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50 focus:bg-slate-900">
              <option value="agent">Agent</option>
              <option value="org_manager">Org Manager</option>
            </select>
            <select value={createExtension} onChange={(e) => setCreateExtension(e.target.value)} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50 focus:bg-slate-900">
              <option value="">{(globalExtensionsLoading || extensionsLoadingByOrg[createOrgId]) ? 'Loading extensions...' : 'Select extension'}</option>
              {createExtensionOptions.map((option) => (
                <option key={`${option.source_org_id || 'global'}:${option.extension}`} value={option.extension}>
                  {option.display_name ? `${option.extension} - ${option.display_name}` : option.extension}
                  {option.source_org_name ? ` (${option.source_org_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleCreateAssignment}
              disabled={savingCreate}
              className="rounded-2xl bg-[linear-gradient(135deg,#06b6d4,#0f766e)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(8,145,178,0.35)] transition hover:brightness-110 disabled:opacity-50"
            >
              {savingCreate ? 'Saving...' : 'Add Agent Assignment'}
            </button>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              {globalExtensionOptions.length} extension option{globalExtensionOptions.length === 1 ? '' : 's'} loaded
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Manual Import</div>
                <div className="text-xs text-slate-400">Pull in a missing extension from MightyCall when it is not yet in the shared inventory.</div>
              </div>
            </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={manualExtension}
              onChange={(e) => setManualExtension(e.target.value)}
              placeholder="Import missing extension from MightyCall"
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50 focus:bg-slate-900 md:w-80"
            />
            <button
              onClick={handleManualImport}
              disabled={manualImportLoading}
              className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-300 transition hover:border-cyan-300/60 hover:bg-cyan-400/15 hover:text-cyan-200 disabled:opacity-50"
            >
              {manualImportLoading ? 'Importing...' : 'Import Extension'}
            </button>
          </div>
          </div>

          {(manualImportMessage || cleanupSummary || globalExtensionsError || globalExtensionsInfo || activeOrgExtensionsError || activeOrgExtensionsInfo || activeOrgHiddenExtensions.length > 0) && (
            <div className="mt-4 space-y-2">
              {manualImportMessage && (
                <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{manualImportMessage}</div>
              )}
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
          </div>
        </section>

        {(error || liveError) && (
          <section className="space-y-2">
            {error && <div className="rounded-lg border border-rose-700/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">{error}</div>}
            {liveError && <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">{liveError}</div>}
          </section>
        )}

        <section className={`${surfaceClass} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div>
              <div className="text-sm font-semibold text-white">Agent Assignments</div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">Live roster</div>
            </div>
            <div className="text-xs text-slate-400">
              {refreshedAt ? `Live status updated ${fmtDate(refreshedAt)}` : 'Live status not loaded yet'}
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-10 text-sm text-slate-400">Loading assignments...</div>
          ) : filteredAssignments.length === 0 ? (
            <div className="px-6 py-10 text-sm text-slate-400">No agent assignments found.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-950/95 backdrop-blur border-b border-white/10 text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Org</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Extension</th>
                    <th className="px-4 py-3 text-left">Live</th>
                    <th className="px-4 py-3 text-left">On Call With</th>
                    <th className="px-4 py-3 text-left">Started</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredAssignments.map((row) => {
                    const key = `${row.user_id}:${row.org_id}`;
                    const isEditing = editingKey === key;
                    const live = liveStatusByAssignment.get(`${row.org_id}:${row.user_id}`);
                    const options = globalExtensionOptions;

                    return (
                      <tr key={key} className="transition hover:bg-white/[0.03]">
                        <td className="px-4 py-3 text-slate-100">
                          <div className="font-medium">{userEmailById.get(row.user_id) || row.user_id}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{orgNameById.get(row.org_id) || row.org_id}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-slate-100">
                              <option value="agent">Agent</option>
                              <option value="org_manager">Org Manager</option>
                            </select>
                          ) : (
                            <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-300">{row.role}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select value={editExtension} onChange={(e) => setEditExtension(e.target.value)} className="min-w-[220px] rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-slate-100">
                              <option value="">{(globalExtensionsLoading || extensionsLoadingByOrg[row.org_id]) ? 'Loading extensions...' : 'Select extension'}</option>
                              {options.map((option) => (
                                <option key={`${option.source_org_id || row.org_id}:${option.extension}`} value={option.extension}>
                                  {option.display_name ? `${option.extension} - ${option.display_name}` : option.extension}
                                  {option.source_org_name ? ` (${option.source_org_name})` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-medium text-slate-200">{row.mightycall_extension || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                            live?.on_call ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20' : 'bg-white/[0.05] text-slate-300 ring-1 ring-white/10'
                          }`}>
                            {live?.on_call ? 'On Call' : (live?.status || 'Idle')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300 break-words">{live?.counterpart || '-'}</td>
                        <td className="px-4 py-3 text-slate-400">{fmtDate(live?.started_at)}</td>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button onClick={() => saveEdit(row)} disabled={savingEdit} className="rounded-xl bg-[linear-gradient(135deg,#06b6d4,#0f766e)] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50">Save</button>
                              <button onClick={() => setEditingKey(null)} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/[0.04]">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => startEditing(row)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.04]">Edit</button>
                              <button onClick={() => removeAssignment(row)} className="rounded-xl border border-rose-500/20 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10">Remove</button>
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
