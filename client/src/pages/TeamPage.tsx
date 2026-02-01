import React, { FC, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "../contexts/OrgContext";
import { getTeamMembersWithMetrics, updateOrgMember, removeOrgMember } from "../data/team";
import type { OrgMember } from "../data/types";
import { PageLayout } from "../components/PageLayout";
import { supabase } from "../lib/supabaseClient";

export const TeamPage: FC = () => {
  const navigate = useNavigate();
  const { org, isAdmin } = useOrg();
  const [members, setMembers] = useState<(OrgMember & { user_email?: string; user_name?: string; today_calls?: number; today_duration?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'agent' as OrgMember['role']
  });

  useEffect(() => {
    if (org) {
      loadMembers();
    }
  }, [org]);

  const loadMembers = async () => {
    if (!org) return;

    setLoading(true);
    try {
      const result = await getTeamMembersWithMetrics(org.id);
      if (result.error) {
        console.error('Error loading team members:', result.error);
        setMembers([]);
      } else {
        setMembers(result.data || []);
      }
    } catch (error) {
      console.error('Error loading members:', error);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || !isAdmin) return;

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { error } = await supabase
        .from('org_invites')
        .insert({
          org_id: org.id,
          email: inviteForm.email,
          role: inviteForm.role,
          invited_by: user.user.id
        });

      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        org_id: org.id,
        user_id: user.user.id,
        action: 'invite_member',
        entity_type: 'org_invite',
        metadata: { email: inviteForm.email, role: inviteForm.role }
      });

      setShowInviteForm(false);
      setInviteForm({ email: '', role: 'member' });
    } catch (error) {
      console.error('Error inviting member:', error);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!org || !isAdmin) return;

    if (!confirm('Are you sure you want to remove this team member?')) return;

    try {
      const result = await removeOrgMember(memberId);
      if (result.error) {
        console.error('Error removing member:', result.error);
        alert('Failed to remove member: ' + result.error.message);
      } else {
        loadMembers(); // Refresh the list
      }
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove member');
    }
  };

  if (!org) {
    return <div>Loading...</div>;
  }

  return (
    <PageLayout title="Team Members" description="Manage your team and invite new members">
      <div className="space-y-6">
        {isAdmin && (
          <button
            onClick={() => setShowInviteForm(true)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
          >
            Invite Member
          </button>
        )}

        <div className="bg-slate-900 rounded-lg p-6">
          {loading ? (
            <div>Loading...</div>
          ) : members.length === 0 ? (
            <p className="text-slate-400">No team members yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">Email</th>
                    <th className="text-left py-2">Role</th>
                    <th className="text-left py-2">Extension</th>
                    <th className="text-left py-2">Today's Calls</th>
                    <th className="text-left py-2">Today's Duration</th>
                    <th className="text-left py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-b border-slate-800">
                      <td className="py-2">{member.user_name || 'Unknown'}</td>
                      <td className="py-2">{member.user_email || 'Unknown'}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          member.role === 'org_owner' ? 'bg-purple-900 text-purple-300' :
                          member.role === 'org_admin' ? 'bg-blue-900 text-blue-300' :
                          member.role === 'org_manager' ? 'bg-green-900 text-green-300' :
                          'bg-gray-900 text-gray-300'
                        }`}>
                          {member.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2">{member.mightycall_extension || '-'}</td>
                      <td className="py-2">{member.today_calls || 0}</td>
                      <td className="py-2">
                        {member.today_duration ? `${Math.round(member.today_duration / 60)}m` : '-'}
                      </td>
                      <td className="py-2">
                        {isAdmin && member.role !== 'org_owner' && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
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
            </div>
          )}
        </div>

        {/* Invite Form Modal */}
        {showInviteForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-slate-900 p-6 rounded-lg max-w-md w-full mx-4">
              <h3 className="text-lg font-medium mb-4">Invite Team Member</h3>
              <form onSubmit={handleInvite}>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Role</label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                  >
                    Send Invite
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInviteForm(false)}
                    className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
};