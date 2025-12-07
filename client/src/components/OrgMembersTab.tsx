import * as React from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Member {
  id: string;
  email: string;
  role: string;
}

export default function OrgMembersTab({ orgId }: { orgId: string }) {
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
    const { data, error } = await supabase
      .from('organization_members')
      .select('id, role, user_id: user_id, users: user_id (email)')
      .eq('org_id', orgId);
    if (error) setError(error.message);
    else setMembers((data || []).map((m: any) => ({
      id: m.id,
      email: m.users?.email || '',
      role: m.role,
    })));
    setLoading(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    // 1. Find user by email
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', inviteEmail)
      .single();
    if (userErr || !user) {
      setError('User not found');
      setInviting(false);
      return;
    }
    // 2. Insert into organization_members
    const { error: insertErr } = await supabase.from('organization_members').insert({
      org_id: orgId,
      user_id: user.id,
      role: inviteRole,
    });
    if (insertErr) setError(insertErr.message);
    setInviteEmail('');
    setInviteRole('agent');
    setInviting(false);
    fetchMembers();
  }

  async function handleRemove(memberId: string) {
    if (!window.confirm('Remove this member?')) return;
    await supabase.from('organization_members').delete().eq('id', memberId);
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
          disabled={inviting}
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
                    onClick={() => handleRemove(member.id)}
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
