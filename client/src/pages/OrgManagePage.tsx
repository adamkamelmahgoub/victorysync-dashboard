import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
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
    const userId = user!.id;
    const load = async () => {
      try {
        setLoading(true);
          // Try org-scoped endpoint first (works for org admins during rollouts)
          let resp = await fetch(`/api/orgs/${orgId}`, { headers: { 'x-user-id': userId || '' }, cache: 'no-store' });
          if (!resp.ok) {
            // fallback to admin endpoint if org-scoped not available or returns error
            resp = await fetch(`/api/admin/orgs/${orgId}`, { headers: { 'x-user-id': userId || '' }, cache: 'no-store' });
          }
          if (!resp.ok) {
          // parse server error if possible
          let body: any = null;
          try { body = await resp.json(); } catch (_) { body = await resp.text().catch(() => null); }
          const rawMsg = (body && (body.error || body.detail || body.message)) || `${resp.status} ${resp.statusText}`;
          // Make a friendlier error message for the UI
          let friendly = 'Failed to load org';
          if (rawMsg && rawMsg.toString().toLowerCase().includes('org_not_found')) friendly = 'Organization not found (404)';
          else if (/\b404\b/.test(rawMsg?.toString?.())) friendly = 'Organization endpoint not found (404)';
          else if (/\b403\b/.test(rawMsg?.toString?.())) friendly = 'Access forbidden (403)';
          setOrgError(friendly);
          // Try fallback: org-scoped members endpoint which should work for org admins
          try {
            const mresp = await fetch(`/api/orgs/${orgId}/members`, { headers: { 'x-user-id': userId || '' }, cache: 'no-store' });
            if (mresp.ok) {
              const mj = await mresp.json();
              setOrgName((mj.org && mj.org.name) || 'Organization');
            } else {
              // as a last resort, try fetching list of orgs and find by id
              try {
                const listRes = await fetch(`/api/admin/orgs`, { headers: { 'x-user-id': userId || '' }, cache: 'no-store' });
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
            // Throw the parsed server message (if available) so callers see a useful error
            throw new Error(rawMsg || 'Failed to load org');
        }
      const j = await resp.json();
        setOrgName(j.name || 'Organization');
        setOrgError(null);
        // Prefer server check for membership (works with legacy tables and RBAC)
        async function checkAdmin() {
          try {
            const mresp = await fetch(`/api/orgs/${orgId}/members`, { headers: { 'x-user-id': userId || '' }, cache: 'no-store' });
            if (mresp.ok) {
              const mj = await mresp.json();
              const me = (mj.members || []).find((m: any) => m.user_id === userId);
              if (me && (me.role === 'org_admin' || me.role === 'org_manager')) { setIsOrgAdmin(true); return me.role; }
              return null;
            }
            // members API may not be deployed yet; fall back to client-side check
            if (mresp.status === 404) {
              // Try both modern and legacy membership tables via Supabase client
              try {
                const { data: d1, error: e1 } = await supabase.from('org_users').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
                if (!e1 && d1 && (d1.role === 'org_admin' || d1.role === 'org_manager')) { setIsOrgAdmin(true); return d1.role; }
              } catch (_) {
                // ignore
              }
              try {
                const { data: d2, error: e2 } = await supabase.from('organization_members').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
                if (!e2 && d2 && (d2.role === 'org_admin' || d2.role === 'org_manager')) { setIsOrgAdmin(true); return d2.role; }
              } catch (_) {
                // ignore (table may not exist or RLS prevents access)
              }
            }
          } catch (e) {
            // fallback to supabase client as a last resort
            try {
              const { data, error } = await supabase.from('org_users').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
              if (!error && data && (data.role === 'org_admin' || data.role === 'org_manager')) { setIsOrgAdmin(true); return data.role; }
            } catch (_) {}
            try {
              const { data: d2, error: e2 } = await supabase.from('organization_members').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
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
    const userId = user!.id;
    try {
      // Try server members endpoint
      const mresp = await fetch(`/api/orgs/${orgId}/members`, { headers: { 'x-user-id': userId || '' }, cache: 'no-store' });
      if (mresp.ok) {
        const mj = await mresp.json();
        const me = (mj.members || []).find((m: any) => m.user_id === userId);
        if (me && (me.role === 'org_admin' || me.role === 'org_manager')) { setIsOrgAdmin(true); setAdminCheckDone(true); return; }
      }
      // Fall back to client checks
      const { data: d1, error: e1 } = await supabase.from('org_users').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
      if (!e1 && d1 && (d1.role === 'org_admin' || d1.role === 'org_manager')) { setIsOrgAdmin(true); setAdminCheckDone(true); return; }
      const { data: d2, error: e2 } = await supabase.from('organization_members').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
      if (!e2 && d2 && (d2.role === 'org_admin' || d2.role === 'org_manager')) { setIsOrgAdmin(true); setAdminCheckDone(true); return; }
      setAdminCheckDone(true);
    } catch (e) {
      setAdminCheckDone(false);
    }
  }

  if (loading) return (<div className="min-h-screen flex items-center justify-center">Loading...</div>);
  if (!orgId) return (<div className="p-8">Missing organization ID</div>);

  return (
    <PageLayout title={orgName || 'Organization'} description="Manage organization settings and members">
      <div className="space-y-6">
        {/* Error Alert */}
        {orgError && (
          <div className="bg-rose-900/20 border border-rose-800 rounded-lg p-4">
            <p className="text-rose-400 text-sm">{orgError}</p>
          </div>
        )}

        {/* Admin Status Section */}
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm text-slate-400">Admin Status</p>
              <p className="text-slate-200">
                {adminCheckDone ? (isOrgAdmin ? 'You are an admin' : 'You are a member') : 'Checking...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => recheckAdmin()} 
              className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg transition-colors"
            >
              Re-check admin status
            </button>
            {adminCheckDone ? (
              <div className={`px-3 py-2 rounded-lg text-sm font-medium ${isOrgAdmin ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>
                {isOrgAdmin ? 'Admin' : 'Member'}
              </div>
            ) : (
              <div className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-800 text-slate-400">
                Checking...
              </div>
            )}
          </div>
        </div>

        {/* Organization Tabs */}
        <OrganizationTabs orgId={orgId} isOrgAdmin={isOrgAdmin} adminCheckDone={adminCheckDone} />
      </div>
    </PageLayout>
  );
}

