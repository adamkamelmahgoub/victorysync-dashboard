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

export default function OrgMembersTab({ orgId, isOrgAdmin }: { orgId: string; isOrgAdmin?: boolean }) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('agent');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetchMembers();
    // eslint-disable-next-line
  }, [orgId]);

  async function fetchMembers() {
    setLoading(true);
    setError(null);
    try {
      const result = await getOrgMembers(orgId, user?.id);
      const list = (result.members || []).map((m: any) => ({ id: m.id, userId: m.user_id, email: m.email || '', role: m.role }));
      setMembers(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to load members');
    }
    setLoading(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    if (!isOrgAdmin) { setError('Only organization admins can invite members'); setInviting(false); return; }
    try {
      const json = await createOrgMember(orgId, inviteEmail, inviteRole, user?.id || undefined);
      if (json?.error) setError(json.error);
    } catch (e: any) {
      setError(e?.message || 'Failed to invite user');
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
    try {
      await deleteOrgMember(orgId, memberUserId || '', user?.id || undefined);
    } catch (e: any) {
      setError(e?.message || 'Failed to remove member');
    }
    fetchMembers();
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Members</h2>
      <form onSubmit={handleInvite} className="mb-6 flex gap-2 items-end">
        <div>
          <label className="block text-xs font-semibold mb-1">Email</label>
          <input
            className="p-2 rounded bg-gray-900 border border-gray-700"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            type="email"
            required
          />
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
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          disabled={inviting || !isOrgAdmin}
        >
          {inviting ? 'Inviting...' : 'Invite'}
        </button>
      </form>
      {error && <div className="text-red-500 mb-2">{error}</div>}
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
                <td className="p-2">{member.role}</td>
                <td className="p-2">
                  <button
                    className="text-red-500 hover:underline text-xs"
                    onClick={() => handleRemove(member.userId)}
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
