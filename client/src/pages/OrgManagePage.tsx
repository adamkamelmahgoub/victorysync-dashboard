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
        // Check if current user is org admin via org_users table
        const { data, error } = await supabase.from('org_users').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle();
        if (!error && data && (data.role === 'org_admin' || data.role === 'org_manager')) setIsOrgAdmin(true);
      } catch (e) {
        // ignore
      } finally { setLoading(false); }
    };
    load();
  }, [orgId, user]);

  if (loading) return (<div className="min-h-screen flex items-center justify-center">Loading...</div>);
  if (!orgId) return (<div className="p-8">Missing organization ID</div>);

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <button onClick={() => navigate('/dashboard')} className="text-sm text-slate-400 mr-2">← Back</button>
          <h1 className="text-2xl font-bold inline">Manage Organization {orgName}</h1>
        </div>
        <OrganizationTabs orgId={orgId} isOrgAdmin={isOrgAdmin} />
      </div>
    </div>
  );
}

