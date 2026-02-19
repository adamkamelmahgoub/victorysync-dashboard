import * as React from 'react';
import { useEffect, useState } from 'react';
import {
  getOrgMembers,
  createOrgMember,
  deleteOrgMember,
  updateOrgMemberRole,
  getOrgManagerPermissions,
  saveOrgManagerPermissions
} from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

interface Member {
  id: string; // org_user id
  userId?: string; // user id
  email: string;
  role: string;
  pending_invite?: boolean;
}

export default function OrgMembersTab({ orgId, isOrgAdmin, adminCheckDone }: { orgId: string; isOrgAdmin?: boolean; adminCheckDone?: boolean }) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('agent');
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [lastInviteAttempt, setLastInviteAttempt] = useState<string | null>(null);
  const [lastInviteResult, setLastInviteResult] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [permEditorFor, setPermEditorFor] = useState<string | null>(null);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permDraft, setPermDraft] = useState({
    can_manage_agents: false,
    can_manage_phone_numbers: false,
    can_edit_service_targets: false,
    can_view_billing: false,
  });
  // Allow sending an invite if admin check hasn't completed yet (server will enforce permissions),
  // but disable when we've completed the check and the actor is confirmed not an admin.
  const inviteDisabled = inviting || apiUnavailable || !inviteEmail.trim() || (adminCheckDone && !isOrgAdmin);

  useEffect(() => {
    fetchMembers();
    // eslint-disable-next-line
  }, [orgId]);

  async function fetchMembers() {
    setLoading(true);
    setError(null);
    try {
      const result = await getOrgMembers(orgId, user?.id);
      setApiUnavailable(false);
      const list = (result.members || []).map((m: any) => ({ id: m.id, userId: m.user_id, email: m.email || '', role: m.role, pending_invite: !!m.pending_invite }));
      setMembers(list);
      const nextDrafts: Record<string, string> = {};
      for (const m of list) nextDrafts[m.id] = m.role;
      setRoleDrafts(nextDrafts);
    } catch (e: any) {
      if (e?.status === 404) {
        setApiUnavailable(true);
        setError('Members API unavailable (404). Server endpoints may not be deployed.');
      } else {
        setError(e?.message || 'Failed to load members');
      }
    }
    setLoading(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    // Debug logging to help diagnose "button does nothing" issues
    // eslint-disable-next-line no-console
    console.debug('[OrgMembersTab] handleInvite start', { isOrgAdmin, apiUnavailable, inviteEmail });
    setLastInviteAttempt(JSON.stringify({ ts: new Date().toISOString(), isOrgAdmin, apiUnavailable, inviteEmail }));
    setLastInviteResult(null);
    setInviting(true);
    setError(null);
    // When adminCheckDone is true, the check completed and we should disallow non-admins.
    if (adminCheckDone && !isOrgAdmin) { setError('Only organization admins can invite members'); setInviting(false); return; }
    if (apiUnavailable) { setError('Members API unavailable; cannot invite'); setInviting(false); return; }
    if (!inviteEmail || !inviteEmail.trim()) { setError('Please enter an email to invite'); setInviting(false); return; }
    try {
      const json = await createOrgMember(orgId, inviteEmail, inviteRole, user?.id || undefined);
      if (json?.error) setError(json.error);
      else {
        const msg = `Invited ${inviteEmail} as ${inviteRole}`;
        setInviteSuccess(msg);
        setLastInviteResult(msg);
      }
    } catch (e: any) {
      const emsg = e?.message || 'Failed to invite user';
      setError(emsg);
      setLastInviteResult(`error: ${emsg}`);
    }
    setInviteEmail('');
    setInviteRole('agent');
    setInviting(false);
    fetchMembers();
  }

  async function handleRemove(memberUserId: string | undefined) {
    if (!window.confirm('Remove this member?')) return;
    // Only block removal when we've completed the admin check and the user is not an admin.
    if (adminCheckDone && !isOrgAdmin) { setError('Only organization admins can remove members'); return; }
    if (!memberUserId) { setError('Invalid member'); return; }
    if (apiUnavailable) { setError('Members API unavailable; cannot remove members'); return; }
    try {
      await deleteOrgMember(orgId, memberUserId || '', user?.id || undefined);
    } catch (e: any) {
      setError(e?.message || 'Failed to remove member');
    }
    fetchMembers();
  }

  async function handleRoleSave(member: Member) {
    if (!member.userId) return;
    if (adminCheckDone && !isOrgAdmin) { setError('Only organization admins can edit roles'); return; }
    const nextRole = roleDrafts[member.id] || member.role;
    if (!nextRole || nextRole === member.role) return;
    setSavingRoleId(member.id);
    setError(null);
    try {
      await updateOrgMemberRole(orgId, member.userId, nextRole, user?.id || undefined);
      setInviteSuccess(`Updated ${member.email} role to ${nextRole}`);
      await fetchMembers();
    } catch (e: any) {
      setError(e?.message || 'Failed to update role');
    } finally {
      setSavingRoleId(null);
    }
  }

  async function openPermissionEditor(member: Member) {
    if (adminCheckDone && !isOrgAdmin) { setError('Only organization admins can manage permissions'); return; }
    setPermEditorFor(member.id);
    setPermLoading(true);
    setError(null);
    try {
      const json = await getOrgManagerPermissions(orgId, member.id, user?.id || undefined);
      const p = json?.permissions || {};
      setPermDraft({
        can_manage_agents: !!p.can_manage_agents,
        can_manage_phone_numbers: !!p.can_manage_phone_numbers,
        can_edit_service_targets: !!p.can_edit_service_targets,
        can_view_billing: !!p.can_view_billing,
      });
    } catch {
      setPermDraft({
        can_manage_agents: false,
        can_manage_phone_numbers: false,
        can_edit_service_targets: false,
        can_view_billing: false,
      });
    } finally {
      setPermLoading(false);
    }
  }

  async function savePermissionEditor(memberId: string) {
    if (adminCheckDone && !isOrgAdmin) { setError('Only organization admins can manage permissions'); return; }
    setPermSaving(true);
    setError(null);
    try {
      await saveOrgManagerPermissions(orgId, memberId, permDraft, user?.id || undefined);
      setInviteSuccess('Manager permissions updated');
      setPermEditorFor(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to save manager permissions');
    } finally {
      setPermSaving(false);
    }
  }

  async function handleAcceptInvite(inviteId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/invites/${inviteId}/accept`, {
        method: 'POST',
        headers: { 'x-user-id': user?.id || '' },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Failed to accept invite' }));
        setError(body.error || 'Failed to accept invite');
        return;
      }
      setInviteSuccess('Invite accepted successfully!');
      fetchMembers();
    } catch (e: any) {
      setError(e?.message || 'Failed to accept invite');
    }
  }

  async function handleRejectInvite(inviteId: string) {
    if (!window.confirm('Reject this invite? You will not be able to join this organization.')) return;
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/invites/${inviteId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user?.id || '' },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Failed to reject invite' }));
        setError(body.error || 'Failed to reject invite');
        return;
      }
      setInviteSuccess('Invite rejected');
      fetchMembers();
    } catch (e: any) {
      setError(e?.message || 'Failed to reject invite');
    }
  }

  return (
    <div className="p-4">
      {apiUnavailable && (
        <div className="mb-4 p-3 bg-rose-900/30 text-rose-300 rounded">Members API unavailable (404). Server endpoints may not be deployed; management actions are disabled.</div>
      )}
      <div className="bg-slate-900/70 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Members</h2>
          <div className="text-sm text-gray-400">Manage organization members and pending invites</div>
        </div>
        <form onSubmit={handleInvite} className="mb-2 grid grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold mb-1">Email</label>
            <input
              className="p-2 rounded bg-slate-800 border border-slate-700 w-full text-sm text-slate-200"
              value={inviteEmail}
              onChange={e => { setInviteEmail(e.target.value); if (error) setError(null); if (inviteSuccess) setInviteSuccess(null); }}
              type="email"
            />
            <div className="mt-2">
              <button type="button" className="text-xs text-gray-400 hover:underline" onClick={() => setInviteEmail(user?.email || '')}>Use my email</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Role</label>
            <select
              className="p-2 rounded bg-slate-800 border border-slate-700 w-full text-sm text-slate-200"
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
            >
              <option value="org_admin">Org Admin</option>
              <option value="org_manager">Org Manager</option>
              <option value="agent">Agent</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              data-testid="invite-button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded"
              onClick={(e) => { /* also call onClick debug in case native submit is blocked */ handleInvite(e as any); }}
              disabled={inviteDisabled}
            >
              {inviting ? 'Inviting...' : 'Invite'}
            </button>
            <button type="button" className="py-2 px-3 text-sm bg-slate-800 rounded" onClick={() => { setInviteEmail(''); setInviteRole('agent'); setError(null); }}>Clear</button>
          </div>
        </form>
        {error && <div className="text-rose-400 mb-2">{error}</div>}
        {inviteSuccess && <div className="text-emerald-300 mb-2">{inviteSuccess}</div>}
      </div>

      <div className="text-xs text-gray-500 mb-2">Debug: isOrgAdmin={String(isOrgAdmin)}, adminCheckDone={String(adminCheckDone)}, apiUnavailable={String(apiUnavailable)}, inviting={String(inviting)}, inviteEmail={String(inviteEmail)}, inviteDisabled={String(inviteDisabled)}</div>
      {lastInviteAttempt && <div className="text-sm text-gray-400 mb-1">Last invite attempt: {lastInviteAttempt}</div>}
      {lastInviteResult && <div className="text-sm text-gray-300 mb-2">Last invite result: {lastInviteResult}</div>}

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-400">Loading members...</div>
      ) : (
        <div className="bg-slate-900/70 rounded shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-900/60">
              <tr>
                <th className="p-3 text-sm text-slate-300">Email</th>
                <th className="p-3 text-sm text-slate-300">Role</th>
                <th className="p-3 text-sm text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => (
                <React.Fragment key={member.id}>
                <tr className="border-t border-slate-800">
                  <td className="p-3 text-slate-200">{member.email}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {member.pending_invite ? (
                        <span className="text-slate-200">{member.role}</span>
                      ) : (
                        <select
                          className="p-1.5 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200"
                          value={roleDrafts[member.id] || member.role}
                          disabled={apiUnavailable || (adminCheckDone && !isOrgAdmin)}
                          onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [member.id]: e.target.value }))}
                        >
                          <option value="org_admin">Org Admin</option>
                          <option value="org_manager">Org Manager</option>
                          <option value="agent">Agent</option>
                        </select>
                      )}
                      {member.pending_invite && (
                        <span className="text-xs bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded">
                          Pending
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 flex gap-2">
                    {member.pending_invite && !apiUnavailable ? (
                      <>
                        <button
                          className="px-2 py-1 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600 transition-colors"
                          onClick={() => handleAcceptInvite(member.id)}
                          title="Accept this invite"
                        >
                          Accept
                        </button>
                        <button
                          className="px-2 py-1 text-xs bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
                          onClick={() => handleRejectInvite(member.id)}
                          title="Reject this invite"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="px-2 py-1 text-xs bg-blue-700 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
                          onClick={() => handleRoleSave(member)}
                          disabled={
                            apiUnavailable ||
                            (adminCheckDone && !isOrgAdmin) ||
                            savingRoleId === member.id ||
                            (roleDrafts[member.id] || member.role) === member.role
                          }
                        >
                          {savingRoleId === member.id ? 'Saving...' : 'Save Role'}
                        </button>
                        {((roleDrafts[member.id] || member.role) === 'org_manager' || member.role === 'org_manager') && (
                          <button
                            className="px-2 py-1 text-xs bg-indigo-700 text-white rounded hover:bg-indigo-600 transition-colors disabled:opacity-50"
                            onClick={() => openPermissionEditor(member)}
                            disabled={apiUnavailable || (adminCheckDone && !isOrgAdmin)}
                          >
                            Permissions
                          </button>
                        )}
                        <button
                          className="px-2 py-1 text-sm bg-rose-700 text-white rounded hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => handleRemove(member.userId || member.id)}
                          disabled={apiUnavailable || (adminCheckDone && !isOrgAdmin)}
                          title={apiUnavailable || (adminCheckDone && !isOrgAdmin) ? 'No permission' : 'Remove member'}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {permEditorFor === member.id && (
                <tr className="border-t border-slate-800 bg-slate-900/50">
                  <td className="p-3 text-slate-300 text-xs" colSpan={3}>
                    {permLoading ? (
                      <div>Loading permissions...</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="font-semibold text-slate-200">Manager Permissions</div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={permDraft.can_manage_agents} onChange={(e) => setPermDraft((p) => ({ ...p, can_manage_agents: e.target.checked }))} />
                            <span>Manage Agents</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={permDraft.can_manage_phone_numbers} onChange={(e) => setPermDraft((p) => ({ ...p, can_manage_phone_numbers: e.target.checked }))} />
                            <span>Manage Phone Numbers</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={permDraft.can_edit_service_targets} onChange={(e) => setPermDraft((p) => ({ ...p, can_edit_service_targets: e.target.checked }))} />
                            <span>Edit Service Targets</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={permDraft.can_view_billing} onChange={(e) => setPermDraft((p) => ({ ...p, can_view_billing: e.target.checked }))} />
                            <span>View Billing</span>
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="px-2 py-1 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600 disabled:opacity-50"
                            onClick={() => savePermissionEditor(member.id)}
                            disabled={permSaving}
                          >
                            {permSaving ? 'Saving...' : 'Save Permissions'}
                          </button>
                          <button
                            className="px-2 py-1 text-xs bg-slate-700 text-white rounded hover:bg-slate-600"
                            onClick={() => setPermEditorFor(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
