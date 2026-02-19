import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../../components/PageLayout';
import AdminTopNav from '../../components/AdminTopNav';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';

type Org = { id: string; name: string };

type InviteRow = {
  id: string;
  org_id: string;
  org_name: string | null;
  email: string;
  role: string;
  invite_code: string;
  invited_at?: string;
  invited_by_email?: string | null;
};

export default function AdminInviteCodesPage() {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [filterOrgId, setFilterOrgId] = useState('');
  const [filterEmail, setFilterEmail] = useState('');

  const [issueOrgId, setIssueOrgId] = useState('');
  const [issueEmail, setIssueEmail] = useState('');
  const [issueRole, setIssueRole] = useState('agent');
  const [issuing, setIssuing] = useState(false);

  const headers = useMemo(() => ({ 'x-user-id': user?.id || '' }), [user?.id]);

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setSuccess(`Copied: ${value}`);
      setTimeout(() => setSuccess(null), 1500);
    } catch {
      setError('Copy failed. Please copy manually.');
      setTimeout(() => setError(null), 2000);
    }
  };

  const loadOrgs = async () => {
    try {
      const resp = await fetch(buildApiUrl('/api/admin/orgs'), { headers, cache: 'no-store' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.detail || 'Failed to load organizations');
      const rows = (json.orgs || []).map((o: any) => ({ id: o.id, name: o.name }));
      setOrgs(rows);
      if (!issueOrgId && rows.length > 0) setIssueOrgId(rows[0].id);
    } catch (e: any) {
      setError(e?.message || 'Failed to load organizations');
    }
  };

  const loadInvites = async () => {
    try {
      setLoading(true);
      setError(null);
      const q = new URLSearchParams();
      if (filterOrgId) q.set('orgId', filterOrgId);
      if (filterEmail.trim()) q.set('email', filterEmail.trim());
      q.set('limit', '5000');
      const resp = await fetch(buildApiUrl(`/api/admin/invite-codes?${q.toString()}`), { headers, cache: 'no-store' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.detail || 'Failed to load invite codes');
      setInvites(json.invites || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load invite codes');
      setInvites([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    loadOrgs();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    loadInvites();
  }, [user?.id, filterOrgId, filterEmail]);

  const issueInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueOrgId || !issueEmail.trim()) {
      setError('Organization and email are required.');
      return;
    }
    try {
      setIssuing(true);
      setError(null);
      const resp = await fetch(buildApiUrl('/api/admin/invite-codes'), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: issueOrgId,
          email: issueEmail.trim(),
          role: issueRole,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.detail || 'Failed to issue invite code');
      const code = json?.invite?.invite_code;
      setSuccess(code ? `Invite code issued: ${code}` : 'Invite code issued');
      setIssueEmail('');
      await loadInvites();
    } catch (e: any) {
      setError(e?.message || 'Failed to issue invite code');
    } finally {
      setIssuing(false);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!window.confirm('Revoke this invite code?')) return;
    try {
      const resp = await fetch(buildApiUrl(`/api/admin/invite-codes/${encodeURIComponent(inviteId)}`), {
        method: 'DELETE',
        headers,
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json.detail || 'Failed to revoke invite code');
      }
      setSuccess('Invite code revoked');
      await loadInvites();
    } catch (e: any) {
      setError(e?.message || 'Failed to revoke invite code');
    }
  };

  return (
    <PageLayout title="Invite Codes" description="Manage organization IDs and issue or revoke invite codes">
      <AdminTopNav />

      {error && <div className="mb-4 rounded border border-rose-500/40 bg-rose-900/20 p-3 text-rose-200 text-sm">{error}</div>}
      {success && <div className="mb-4 rounded border border-emerald-500/40 bg-emerald-900/20 p-3 text-emerald-200 text-sm">{success}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-1 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Issue New Invite Code</h2>
          <form onSubmit={issueInvite} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Organization</label>
              <select
                value={issueOrgId}
                onChange={(e) => setIssueOrgId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                <option value="">Select organization</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name} ({o.id})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <input
                value={issueEmail}
                onChange={(e) => setIssueEmail(e.target.value)}
                type="email"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                placeholder="owner@company.com"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Role</label>
              <select
                value={issueRole}
                onChange={(e) => setIssueRole(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                <option value="org_admin">Org Admin</option>
                <option value="org_manager">Org Manager</option>
                <option value="agent">Agent</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={issuing}
              className="w-full rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60"
            >
              {issuing ? 'Issuing...' : 'Issue Invite Code'}
            </button>
          </form>
        </section>

        <section className="xl:col-span-2 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <select
              value={filterOrgId}
              onChange={(e) => setFilterOrgId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">All orgs</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <input
              value={filterEmail}
              onChange={(e) => setFilterEmail(e.target.value)}
              className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              placeholder="Filter by email"
            />
            <button
              onClick={() => loadInvites()}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700"
            >
              Refresh
            </button>
          </div>

          <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/80 text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Org</th>
                  <th className="px-3 py-2 text-left">Org ID</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Invite Code</th>
                  <th className="px-3 py-2 text-left">Invited</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-4 text-slate-400" colSpan={7}>Loading invite codes...</td></tr>
                ) : invites.length === 0 ? (
                  <tr><td className="px-3 py-4 text-slate-400" colSpan={7}>No invite codes found.</td></tr>
                ) : (
                  invites.map((inv) => (
                    <tr key={inv.id} className="border-t border-slate-800 text-slate-100">
                      <td className="px-3 py-2">{inv.org_name || '-'}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <button className="underline text-cyan-300" onClick={() => copyText(inv.org_id)}>{inv.org_id}</button>
                      </td>
                      <td className="px-3 py-2">{inv.email}</td>
                      <td className="px-3 py-2 uppercase text-xs">{inv.role}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <button className="underline text-emerald-300" onClick={() => copyText(inv.invite_code)}>{inv.invite_code}</button>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-300">
                        {inv.invited_at ? new Date(inv.invited_at).toLocaleString() : '-'}
                        {inv.invited_by_email ? ` by ${inv.invited_by_email}` : ''}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => revokeInvite(inv.id)}
                          className="rounded border border-rose-500/40 bg-rose-900/20 px-2 py-1 text-xs text-rose-200 hover:bg-rose-900/30"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}

