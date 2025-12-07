import * as React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useOrgStats } from '../../hooks/useOrgStats';
import { API_BASE_URL } from '../../config';
import { useAuth } from '../../contexts/AuthContext';

interface Organization {
  id: string;
  name: string;
  created_at: string;
  total_calls?: number;
  answered_calls?: number;
  answer_rate_pct?: number;
}

interface OrgDetailsModalProps {
  org: Organization;
  onClose: () => void;
}

interface Member {
  orgMemberId: string;
  user_id: string;
  email: string | null;
  role: string;
  mightycall_extension?: string | null;
}

// Org Details Modal Component
function OrgDetailsModal({ org, onClose }: OrgDetailsModalProps) {
  const [stats, setStats] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [phones, setPhones] = useState<Array<{ id: string; number: string; label: string | null }>>([]);
  const [phonesLoading, setPhonesLoading] = useState(true);
  const { user } = useAuth();
  const [canEditPhones, setCanEditPhones] = useState(false);
  const [showEditPhones, setShowEditPhones] = useState(false);
  const [showPermissionsEditor, setShowPermissionsEditor] = useState<{ orgMemberId: string; memberEmail: string } | null>(null);

  const reloadOrgDetails = async () => {
    setMembersLoading(true);
    setPhonesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/orgs/${org.id}`);
      if (!res.ok) throw new Error('Failed to fetch org details');
      const j = await res.json();
      setMembers(j.members || []);
      setPhones(j.phones || []);
      setStats(j.stats || null);
      setCanEditPhones(Boolean(j.permissions?.canEditPhoneNumbers));
    } catch (err: any) {
      console.error('Failed to fetch org details:', err);
    } finally {
      setMembersLoading(false);
      setPhonesLoading(false);
    }
  };

  useEffect(() => {
    reloadOrgDetails();
  }, [org.id]);

  // EditPhonesModal component
  function EditPhonesModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
    const [unassigned, setUnassigned] = useState<Array<{ id: string; number: string; label?: string }>>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      const load = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/admin/mightycall/phone-numbers?unassignedOnly=true`);
          if (!res.ok) throw new Error('Failed to load numbers');
          const j = await res.json();
          setUnassigned(j.phone_numbers || []);
        } catch (err) {
          console.error('load numbers failed', err);
        }
      };
      load();
    }, [orgId]);

    const save = async () => {
      if (selected.length === 0) return onClose();
      try {
        setSaving(true);
        const res = await fetch(`${API_BASE_URL}/api/admin/orgs/${orgId}/phone-numbers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
          body: JSON.stringify({ phoneNumberIds: selected }),
        });
        if (!res.ok) throw new Error('Assign failed');
        onClose();
      } catch (err) {
        console.error('Assign failed', err);
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-lg bg-slate-900 rounded-lg p-5 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg">Edit phone numbers</h3>
            <button onClick={onClose} className="text-slate-400">×</button>
          </div>

          <div className="mb-4">
            <label className="block text-xs text-slate-400 mb-2">Available unassigned numbers</label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {unassigned.map((n) => (
                <label key={n.id} className="flex items-center gap-2 bg-slate-800/30 p-2 rounded">
                  <input type="checkbox" checked={selected.includes(n.id)} onChange={(e) => {
                    const next = e.target.checked ? [...selected, n.id] : selected.filter(s => s !== n.id);
                    setSelected(next);
                  }} />
                  <div>
                    <div className="text-sm">{n.number}</div>
                    {n.label && <div className="text-xs text-slate-400">{n.label}</div>}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1 bg-slate-700 rounded">Cancel</button>
            <button onClick={save} disabled={saving} className="px-3 py-1 bg-emerald-500 rounded">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
    );
  }

  // OrgManagerPermissionsModal component
  interface OrgManagerPermissions {
    can_manage_agents: boolean;
    can_manage_phone_numbers: boolean;
    can_edit_service_targets: boolean;
    can_view_billing: boolean;
  }

  function OrgManagerPermissionsModal({
    orgId,
    orgMemberId,
    memberEmail,
    onClose,
    userId,
  }: {
    orgId: string;
    orgMemberId: string;
    memberEmail: string;
    onClose: () => void;
    userId: string;
  }) {
    const [perms, setPerms] = useState<OrgManagerPermissions | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      const load = async () => {
        try {
          setLoading(true);
          const res = await fetch(
            `${API_BASE_URL}/api/admin/orgs/${orgId}/managers/${orgMemberId}/permissions`,
            { headers: { 'x-user-id': userId } }
          );
          if (!res.ok) throw new Error('Failed to load permissions');
          const j = await res.json();
          setPerms(j.permissions || {
            can_manage_agents: false,
            can_manage_phone_numbers: false,
            can_edit_service_targets: false,
            can_view_billing: false,
          });
        } catch (err) {
          console.error('Failed to load permissions', err);
        } finally {
          setLoading(false);
        }
      };
      load();
    }, [orgId, orgMemberId, userId]);

    const save = async () => {
      if (!perms) return;
      try {
        setSaving(true);
        const res = await fetch(
          `${API_BASE_URL}/api/admin/orgs/${orgId}/managers/${orgMemberId}/permissions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
            body: JSON.stringify(perms),
          }
        );
        if (!res.ok) throw new Error('Failed to save permissions');
        onClose();
      } catch (err) {
        console.error('Failed to save permissions', err);
      } finally {
        setSaving(false);
      }
    };

    const togglePerm = (perm: keyof OrgManagerPermissions) => {
      if (!perms) return;
      setPerms({ ...perms, [perm]: !perms[perm] });
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-lg bg-slate-900 rounded-lg p-5 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Manager Permissions</h3>
              <p className="text-xs text-slate-400 mt-1">{memberEmail}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 text-2xl">×</button>
          </div>

          {loading ? (
            <div className="text-xs text-slate-400">Loading...</div>
          ) : perms ? (
            <div className="space-y-3 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={perms.can_manage_agents}
                  onChange={() => togglePerm('can_manage_agents')}
                  className="w-4 h-4"
                />
                <span className="text-sm">Manage agents</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={perms.can_manage_phone_numbers}
                  onChange={() => togglePerm('can_manage_phone_numbers')}
                  className="w-4 h-4"
                />
                <span className="text-sm">Manage phone numbers</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={perms.can_edit_service_targets}
                  onChange={() => togglePerm('can_edit_service_targets')}
                  className="w-4 h-4"
                />
                <span className="text-sm">Edit service targets</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={perms.can_view_billing}
                  onChange={() => togglePerm('can_view_billing')}
                  className="w-4 h-4"
                />
                <span className="text-sm">View billing</span>
              </label>
            </div>
          ) : (
            <div className="text-xs text-slate-400">Failed to load permissions</div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1 bg-slate-700 rounded text-sm">Cancel</button>
            <button
              onClick={save}
              disabled={saving || loading}
              className="px-3 py-1 bg-emerald-500 rounded text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-t-2xl bg-slate-900/95 border border-slate-700 max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 border-b border-slate-700 bg-slate-900/95 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">{org.name}</h2>
            <p className="text-xs text-slate-400 mt-1">Organization details and metrics</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6">
          {/* KPIs */}
          {stats ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-800/50 p-3">
                <div className="text-xs text-slate-400 mb-1">Calls today</div>
                <div className="text-2xl font-semibold text-emerald-400">{stats.total_calls ?? 0}</div>
              </div>
              <div className="rounded-lg bg-slate-800/50 p-3">
                <div className="text-xs text-slate-400 mb-1">Answer rate</div>
                <div className="text-2xl font-semibold text-emerald-400">{stats.answer_rate_pct ?? 0}%</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400">Loading stats...</div>
          )}

          {/* Members Section */}
          <div>
            <h3 className="font-semibold text-sm mb-3 text-slate-200">Members</h3>
            {membersLoading ? (
              <div className="text-xs text-slate-400">Loading...</div>
            ) : members.length === 0 ? (
              <div className="text-xs text-slate-500">No members assigned</div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {members.map((member, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-slate-800/30 rounded-lg p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">
                        {member.email}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {member.role === 'org_manager' && canEditPhones && (
                        <button
                          onClick={() => setShowPermissionsEditor({ orgMemberId: member.orgMemberId || '', memberEmail: member.email || '' })}
                          className="text-[10px] text-emerald-400 hover:underline flex-shrink-0"
                        >
                          Perms
                        </button>
                      )}
                      <span className="text-[10px] text-slate-400 flex-shrink-0">
                        {member.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assigned Numbers */}
          <div>
            <h3 className="font-semibold text-sm mb-3 text-slate-200">Assigned Numbers</h3>
            <div className="flex items-center justify-end">
              {canEditPhones && (
                <button onClick={() => setShowEditPhones(true)} className="text-xs text-emerald-400 hover:underline">Edit numbers</button>
              )}
            </div>

            {phonesLoading ? (
              <div className="text-xs text-slate-400">Loading...</div>
            ) : phones.length === 0 ? (
              <div className="text-xs text-slate-500">No phone numbers assigned</div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {phones.map((phone) => (
                  <div
                    key={phone.id}
                    className="flex items-center justify-between bg-slate-800/30 rounded-lg p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-200">
                        {phone.number}
                      </div>
                      {phone.label && (
                        <div className="text-[10px] text-slate-400">
                          {phone.label}
                        </div>
                      )}
                    </div>
                    <div className="ml-2 flex items-center gap-2">
                      {canEditPhones && (
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Remove ${phone.number}?`)) return;
                            try {
                              const res = await fetch(
                                `${API_BASE_URL}/api/admin/orgs/${org.id}/phone-numbers/${phone.id}`,
                                { method: 'DELETE', headers: { 'x-user-id': user?.id || '' } }
                              );
                              if (!res.ok) throw new Error('Delete failed');
                              reloadOrgDetails();
                            } catch (err) {
                              console.error('Delete failed', err);
                              alert('Failed to remove phone number');
                            }
                          }}
                          className="text-xs text-red-400 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showEditPhones && (
            <EditPhonesModal orgId={org.id} onClose={() => { setShowEditPhones(false); /* reload */ const e = async () => { const r = await fetch(`${API_BASE_URL}/api/admin/orgs/${org.id}`); const j = await r.json(); setPhones(j.phones || []); setCanEditPhones(Boolean(j.permissions?.canEditPhoneNumbers)); }; e(); }} />
          )}

          {showPermissionsEditor && (
            <OrgManagerPermissionsModal
              orgId={org.id}
              orgMemberId={showPermissionsEditor.orgMemberId}
              memberEmail={showPermissionsEditor.memberEmail}
              onClose={() => { setShowPermissionsEditor(null); reloadOrgDetails(); }}
              userId={user?.id || ''}
            />
          )}

          {/* Created date */}
          <div className="text-xs text-slate-500 pt-2 border-t border-slate-700">
            Created {new Date(org.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminOrgsPage() {
  const navigate = useNavigate();
  
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Create org form
  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  // Details modal
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  const fetchOrgs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/org-metrics`);
      if (!res.ok) throw new Error('Failed to fetch org metrics');
      const j = await res.json();
      const list = (j.orgs || []).map((o: any) => ({
        id: o.id,
        name: o.name,
        created_at: o.created_at || new Date().toISOString(),
        total_calls: o.total_calls ?? 0,
        answered_calls: o.answered_calls ?? 0,
        answer_rate_pct: o.answer_rate_pct ?? 0,
      }));
      setOrgs(list);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to fetch organizations');
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(false);

    if (!newOrgName.trim()) {
      setCreateError('Organization name is required');
      return;
    }

    try {
      setCreating(true);

      // Create organization
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({ name: newOrgName })
        .select()
        .single();
      
      if (orgErr) throw orgErr;

      // Create default org_settings
      const { error: settingsErr } = await supabase
        .from('org_settings')
        .insert({
          org_id: org.id,
          sla_answer_target_percent: 90,
          sla_answer_target_seconds: 30,
        });
      
      if (settingsErr) {
        console.error('Settings creation error:', settingsErr);
      }

      setNewOrgName('');
      setCreateSuccess(true);
      setTimeout(() => setCreateSuccess(false), 3000);
      
      await fetchOrgs();
    } catch (err: any) {
      console.error('Create org error:', err);
      setCreateError(err?.message ?? 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-[0.18em]">
              Admin
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Organizations
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Create and manage organizations, view members and call metrics.
            </p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 text-sm text-slate-300 hover:text-emerald-400 transition"
          >
            ← Back
          </button>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* LEFT PANEL: Create org form */}
          <div className="rounded-2xl bg-slate-900/80 ring-1 ring-slate-800 p-5 space-y-4 h-fit">
            <h2 className="font-semibold text-sm">Create Organization</h2>

            {createError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                {createError}
              </div>
            )}

            {createSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300">
                ✓ Organization created successfully!
              </div>
            )}

            <form onSubmit={handleCreateOrg} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Organization name
                </label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 text-white font-semibold rounded-lg text-sm transition"
              >
                {creating ? 'Creating...' : 'Create Organization'}
              </button>
            </form>

            <div className="text-xs text-slate-500 pt-3 border-t border-slate-700">
              Once created, you can assign users, phone numbers, and view real-time call metrics from the list below.
            </div>
          </div>

          {/* RIGHT PANEL: Organizations list */}
          <div className="rounded-2xl bg-slate-900/80 ring-1 ring-slate-800 p-5 overflow-hidden">
            <h2 className="font-semibold text-sm mb-4">Organizations</h2>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 mb-4">
                {error}
              </div>
            )}

            {loading ? (
              <div className="text-xs text-slate-400 text-center py-8">
                Loading organizations...
              </div>
            ) : orgs.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-8">
                No organizations yet. Create one using the form on the left.
              </div>
            ) : (
              <div className="space-y-2">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => setSelectedOrg(org)}
                    className="w-full flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 rounded-lg p-3 transition text-left group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 group-hover:text-emerald-400 transition">
                        {org.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Created {new Date(org.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-emerald-400/60 group-hover:text-emerald-400 transition ml-2">
                      →
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Details Modal */}
      {selectedOrg && (
        <OrgDetailsModal
          org={selectedOrg}
          onClose={() => setSelectedOrg(null)}
        />
      )}
    </main>
  );
}
