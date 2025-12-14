import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import OrganizationTabs from '../components/OrganizationTabs';
import { supabase } from '../lib/supabaseClient';

export default function OrgManagePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [adminCheckDone, setAdminCheckDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId || !user) { setLoading(false); return; }
    const load = async () => {
      try {
        setLoading(true);
        // Fetch org details
        const resp = await fetch(`/api/admin/orgs/${orgId}`, { headers: { 'x-user-id': user?.id || '' }, cache: 'no-store' });
        if (!resp.ok) throw new Error('Failed to fetch org');
        const j = await resp.json();
        setOrgName(j.name || 'Organization');
        // Prefer server check for membership (works with legacy tables and RBAC)
        async function checkAdmin() {
          try {
            const mresp = await fetch(`/api/orgs/${orgId}/members`, { headers: { 'x-user-id': user?.id || '' }, cache: 'no-store' });
            if (mresp.ok) {
              const mj = await mresp.json();
              const me = (mj.members || []).find((m: any) => m.user_id === user.id);
              if (me && (me.role === 'org_admin' || me.role === 'org_manager')) { setIsOrgAdmin(true); return me.role; }
              return null;
            }
            // members API may not be deployed yet; fall back to client-side check
            if (mresp.status === 404) {
              // Try both modern and legacy membership tables via Supabase client
              try {
                const { data: d1, error: e1 } = await supabase.from('org_users').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle();
                if (!e1 && d1 && (d1.role === 'org_admin' || d1.role === 'org_manager')) { setIsOrgAdmin(true); return d1.role; }
              } catch (_) {
                // ignore
              }
              try {
                const { data: d2, error: e2 } = await supabase.from('organization_members').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle();
                if (!e2 && d2 && (d2.role === 'org_admin' || d2.role === 'org_manager')) { setIsOrgAdmin(true); return d2.role; }
              } catch (_) {
                // ignore (table may not exist or RLS prevents access)
              }
            }
          } catch (e) {
            // fallback to supabase client as a last resort
            try {
              const { data, error } = await supabase.from('org_users').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle();
              if (!error && data && (data.role === 'org_admin' || data.role === 'org_manager')) { setIsOrgAdmin(true); return data.role; }
            } catch (_) {}
            try {
              const { data: d2, error: e2 } = await supabase.from('organization_members').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle();
              if (!e2 && d2 && (d2.role === 'org_admin' || d2.role === 'org_manager')) { setIsOrgAdmin(true); return d2.role; }
            } catch (_) {}
          }
          return null;
        }
            await checkAdmin();
            setAdminCheckDone(true);
      } catch (e) {
        // ignore
      } finally { setLoading(false); }
    };
    load();
  }, [orgId, user]);

  async function recheckAdmin() {
    if (!orgId || !user) return;
    try {
      // Try server members endpoint
      const mresp = await fetch(`/api/orgs/${orgId}/members`, { headers: { 'x-user-id': user?.id || '' }, cache: 'no-store' });
      if (mresp.ok) {
        const mj = await mresp.json();
        const me = (mj.members || []).find((m: any) => m.user_id === user.id);
        if (me && (me.role === 'org_admin' || me.role === 'org_manager')) { setIsOrgAdmin(true); setAdminCheckDone(true); return; }
      }
      // Fall back to client checks
      const { data: d1, error: e1 } = await supabase.from('org_users').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle();
      if (!e1 && d1 && (d1.role === 'org_admin' || d1.role === 'org_manager')) { setIsOrgAdmin(true); setAdminCheckDone(true); return; }
      const { data: d2, error: e2 } = await supabase.from('organization_members').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle();
      if (!e2 && d2 && (d2.role === 'org_admin' || d2.role === 'org_manager')) { setIsOrgAdmin(true); setAdminCheckDone(true); return; }
      setAdminCheckDone(true);
    } catch (e) {
      setAdminCheckDone(false);
    }
  }

  if (loading) return (<div className="min-h-screen flex items-center justify-center">Loading...</div>);
  if (!orgId) return (<div className="p-8">Missing organization ID</div>);

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <button onClick={() => navigate('/dashboard')} className="text-sm text-slate-400 mr-2">← Back</button>
          <h1 className="text-2xl font-bold inline">Manage Organization {orgName}</h1>
          <button className="ml-4 text-sm text-gray-400 hover:underline" onClick={() => recheckAdmin()}>Re-check admin status</button>
        </div>
        <OrganizationTabs orgId={orgId} isOrgAdmin={isOrgAdmin} />
      </div>
    </div>
  );
}

