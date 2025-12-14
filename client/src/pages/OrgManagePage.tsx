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
  const [orgError, setOrgError] = useState<string | null>(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [adminCheckDone, setAdminCheckDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId || !user) { setLoading(false); return; }
    const load = async () => {
      try {
        setLoading(true);
          // Try org-scoped endpoint first (works for org admins during rollouts)
          let resp = await fetch(`/api/orgs/${orgId}`, { headers: { 'x-user-id': user?.id || '' }, cache: 'no-store' });
          if (!resp.ok) {
            // fallback to admin endpoint if org-scoped not available or returns error
            resp = await fetch(`/api/admin/orgs/${orgId}`, { headers: { 'x-user-id': user?.id || '' }, cache: 'no-store' });
          }
          if (!resp.ok) {
          // parse server error if possible
          let body: any = null;
          try { body = await resp.json(); } catch (_) { body = await resp.text().catch(() => null); }
          const msg = (body && (body.error || body.detail || body.message)) || `${resp.status} ${resp.statusText}`;
          setOrgError(msg?.toString?.() || String(msg));
          // Try fallback: org-scoped members endpoint which should work for org admins
          try {
            const mresp = await fetch(`/api/orgs/${orgId}/members`, { headers: { 'x-user-id': user?.id || '' }, cache: 'no-store' });
            if (mresp.ok) {
              const mj = await mresp.json();
              setOrgName((mj.org && mj.org.name) || 'Organization');
            } else {
              // as a last resort, try fetching list of orgs and find by id
              try {
                const listRes = await fetch(`/api/admin/orgs`, { headers: { 'x-user-id': user?.id || '' }, cache: 'no-store' });
                if (listRes.ok) {
                  const lj = await listRes.json();
                  const found = (lj.orgs || []).find((o: any) => o.id === orgId);
                  if (found) setOrgName(found.name || 'Organization');
                  else setOrgName(null);
                } else setOrgName(null);
              } catch (_) { setOrgName(null); }
            }
          } catch (_) { setOrgName(null); }
            // If server endpoints are missing (404/NOT_FOUND), fall back to client-side Supabase queries
            try {
              const { data: orgRow, error: orgErr } = await supabase.from('organizations').select('id,name').eq('id', orgId).maybeSingle();
              if (!orgErr && orgRow) {
                setOrgName(orgRow.name || 'Organization');
              } else {
                setOrgName(null);
              }
            } catch (e) {
              setOrgName(null);
            }
            throw new Error(msg);
        }
        const j = await resp.json();
        setOrgName(j.name || 'Organization');
        setOrgError(null);
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
        // Surface a visible placeholder and allow the rest of the page to function
        console.warn('org fetch failed:', e);
        setOrgError((e && (e as any).message) || 'Failed to fetch org');
        // As an additional fallback, attempt to read org and membership directly from Supabase client
        try {
          const { data: orgRow, error: orgErr } = await supabase.from('organizations').select('id,name').eq('id', orgId).maybeSingle();
          if (!orgErr && orgRow) setOrgName(orgRow.name || 'Organization');
          // Ensure adminCheckDone runs
          await recheckAdmin();
        } catch (_) {}
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
          
          <h1 className="text-2xl font-bold inline">Manage Organization {orgName ?? <span className="text-rose-400">(Failed to load org)</span>}</h1>
          {orgError && <div className="ml-4 inline text-sm text-rose-400">{orgError}</div>}
          <button className="ml-4 text-sm text-gray-400 hover:underline" onClick={() => recheckAdmin()}>Re-check admin status</button>
        </div>
        <OrganizationTabs orgId={orgId} isOrgAdmin={isOrgAdmin} adminCheckDone={adminCheckDone} />
      </div>
    </div>
  );
}

