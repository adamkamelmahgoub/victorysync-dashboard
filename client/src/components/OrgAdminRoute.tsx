import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function OrgAdminRoute({ children }: { children: JSX.Element }) {
  const { orgId } = useParams<{ orgId: string }>();
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user || !orgId) { setIsAdmin(false); return; }
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('org_users').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle();
        if (!mounted) return;
        if (!error && data && (data.role === 'org_admin' || data.role === 'org_manager')) setIsAdmin(true);
        else setIsAdmin(false);
      } catch (e) { if (mounted) setIsAdmin(false); }
    })();
    return () => { mounted = false; };
  }, [user, orgId]);

  if (loading || isAdmin === null) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

