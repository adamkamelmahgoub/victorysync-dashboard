import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiKeysTab } from './ApiKeysTab';
import { fetchJson } from '../lib/apiClient';

export default function OrganizationSettingsTab({ orgId, isOrgAdmin, adminCheckDone }: { orgId: string; isOrgAdmin: boolean; adminCheckDone?: boolean }) {
  const { user } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/orgs/${orgId}`, { headers: { 'x-user-id': user?.id || '' }, cache: 'no-store' });
        if (!res.ok) {
          // try to parse error body for helpful message
          let body: any = null;
          try { body = await res.json(); } catch (_) { body = await res.text().catch(() => null); }
          const msg = (body && (body.error || body.detail || body.message)) || `${res.status} ${res.statusText}`;
          // Attempt a lightweight fallback: if admin endpoint missing, try org-scoped members endpoint
          if (res.status === 404) {
            // Try org-scoped endpoint as a fallback (works during staggered deployments)
            try {
              const orgRes = await fetch(`/api/orgs/${orgId}`, { headers: { 'x-user-id': user?.id || '' }, cache: 'no-store' });
              if (orgRes.ok) {
                const oj = await orgRes.json().catch(() => ({}));
                setOrgName(oj.name || 'Organization');
                setError(null);
                return;
              }
            } catch (_) {
              // ignore
            }
            // as a last resort, try members endpoint to infer a name
            try {
              const mres = await fetch(`/api/orgs/${orgId}/members`, { headers: { 'x-user-id': user?.id || '' }, cache: 'no-store' });
              if (mres.ok) {
                const mj = await mres.json();
                setOrgName((mj.org && mj.org.name) || 'Organization');
                setError(null);
                return;
              }
            } catch (_) {
              // ignore
            }
          }
          // If the admin/org endpoints return 404 or are missing, try supabase client as a fallback
          try {
            const { data: orgRow, error: orgErr } = await (await import('../lib/supabaseClient')).supabase.from('organizations').select('id,name').eq('id', orgId).maybeSingle();
            if (!orgErr && orgRow) {
              setOrgName(orgRow.name || 'Organization');
              setError(null);
              setLoading(false);
              return;
            }
          } catch (_) {
            // ignore
          }
          throw new Error(msg);
        }
        const j = await res.json();
        setOrgName(j.name || '');
        setError(null);
      } catch (e: any) { setError(e.message || 'Failed to load org'); }
      finally { setLoading(false); }
    };
    load();
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId) return;
    try {
      setError(null);
      const res = await fetch(`/api/orgs/${orgId}`, {
        method: 'PUT', headers: { 'content-type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({ name: orgName })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error((j && j.detail) || 'Failed to update org');
      }
      setEditing(false);
    } catch (e: any) { setError(e.message || 'Update failed'); }
  };

  if (adminCheckDone && !isOrgAdmin) {
    return (
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <h3 className="text-sm font-medium text-slate-200">Settings</h3>
        <p className="mt-3 text-xs text-slate-400">Only organization admins can manage settings and API keys.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-200">Organization</h3>
          <div className="text-xs text-slate-400">Manage your organization</div>
        </div>
        <div className="mt-3 space-y-2">
          <div className="flex gap-2 items-center">
            <input className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200" value={orgName} onChange={e => setOrgName(e.target.value)} disabled={!editing} />
            {!editing ? (
              <button className="px-3 py-1 text-xs bg-emerald-500/20 text-emerald-300 rounded" onClick={() => setEditing(true)}>Edit</button>
            ) : (
              <div className="flex gap-2">
                <button className="px-3 py-1 text-xs bg-slate-800 rounded" onClick={() => { setEditing(false); fetch(`/api/admin/orgs/${orgId}`); }}>Cancel</button>
                <button className="px-3 py-1 text-xs bg-emerald-500/30 text-emerald-300 rounded" onClick={handleSave}>Save</button>
              </div>
            )}
          </div>
          {error && <div className="text-xs text-rose-400">{error}</div>}
        </div>
      </div>

      <div>
        <ApiKeysTab orgId={orgId} isOrgAdmin={isOrgAdmin} />
      </div>
    </div>
  );
}

