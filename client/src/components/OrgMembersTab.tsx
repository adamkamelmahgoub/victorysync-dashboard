import * as React from 'react';
import { useEffect, useState } from 'react';
import { getOrgMembers, createOrgMember, deleteOrgMember } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

interface Member {
  id: string; // org_user id
  userId?: string; // user id
  email: string;
  role: string;
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
      const list = (result.members || []).map((m: any) => ({ id: m.id, userId: m.user_id, email: m.email || '', role: m.role }));
      setMembers(list);
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
    if (!isOrgAdmin) { setError('Only organization admins can remove members'); return; }
    if (!memberUserId) { setError('Invalid member'); return; }
    if (apiUnavailable) { setError('Members API unavailable; cannot remove members'); return; }
    try {
      await deleteOrgMember(orgId, memberUserId || '', user?.id || undefined);
    } catch (e: any) {
      setError(e?.message || 'Failed to remove member');
    }
    fetchMembers();
  }

  return (
    <div className="p-4">
      {apiUnavailable && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">Members API unavailable (404). Server endpoints may not be deployed; management actions are disabled.</div>
      )}
      <h2 className="text-lg font-bold mb-4">Members</h2>
      <form onSubmit={handleInvite} className="mb-6 flex gap-2 items-end">
        <div>
          <label className="block text-xs font-semibold mb-1">Email</label>
          <input
            className="p-2 rounded bg-gray-900 border border-gray-700"
            value={inviteEmail}
            onChange={e => { setInviteEmail(e.target.value); if (error) setError(null); if (inviteSuccess) setInviteSuccess(null); }}
            onInput={e => { const v = (e.target as HTMLInputElement).value; setInviteEmail(v); if (error) setError(null); if (inviteSuccess) setInviteSuccess(null); }}
            onBlur={e => { const v = (e.target as HTMLInputElement).value; setInviteEmail(v); }}
            type="email"
          />
          <div className="mt-2">
            <button type="button" className="text-xs text-gray-400 hover:underline" onClick={() => setInviteEmail(user?.email || '')}>Use my email</button>
          </div>
          {!inviteEmail && <div className="text-xs text-gray-500 mt-1">Enter an email to enable Invite</div>}
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Role</label>
          <select
            className="p-2 rounded bg-gray-900 border border-gray-700"
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value)}
          >
            <option value="org_admin">Org Admin</option>
            <option value="org_manager">Org Manager</option>
            <option value="agent">Agent</option>
          </select>
        </div>
        <button
          type="submit"
          data-testid="invite-button"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={(e) => { /* also call onClick debug in case native submit is blocked */ handleInvite(e as any); }}
          disabled={inviteDisabled}
        >
          {inviting ? 'Inviting...' : 'Invite'}
        </button>
      </form>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      {inviteSuccess && <div className="text-green-400 mb-2">{inviteSuccess}</div>}
      <div className="text-xs text-gray-500 mb-2">Debug: isOrgAdmin={String(isOrgAdmin)}, adminCheckDone={String(adminCheckDone)}, apiUnavailable={String(apiUnavailable)}, inviting={String(inviting)}, inviteEmail="{inviteEmail}", inviteDisabled={String(inviteDisabled)}</div>
+      {lastInviteAttempt && <div className="text-sm text-gray-400 mb-1">Last invite attempt: {lastInviteAttempt}</div>}
+      {lastInviteResult && <div className="text-sm text-gray-300 mb-2">Last invite result: {lastInviteResult}</div>}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <table className="w-full text-left bg-gray-900 rounded">
          <thead>
            <tr>
              <th className="p-2">Email</th>
              <th className="p-2">Role</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map(member => (
              <tr key={member.id} className="border-t border-gray-800">
                <td className="p-2">{member.email}</td>
                <td className="p-2">{member.role}{member.pending_invite ? ' (invited)' : ''}</td>
                <td className="p-2">
                  <button
                    className="text-red-500 hover:underline text-xs"
                    onClick={() => handleRemove(member.userId || member.id)}
                    disabled={apiUnavailable}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
