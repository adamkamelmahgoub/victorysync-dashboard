import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, supabaseUrl } from '../lib/supabaseClient';

interface OrgUser {
  org_id: string;
  user_id: string;
  role: string;
}

interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export function DebugAuthPage() {
  const { user } = useAuth();
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDebugData() {
      if (!user) return;

      try {
        setLoading(true);
        setError(null);

        // Query org_users for this user
        const { data: orgUsersData, error: orgUsersError } = await supabase
          .from('org_users')
          .select('org_id, user_id, role')
          .eq('user_id', user.id);

        if (orgUsersError) {
          console.error('[DEBUG] org_users query error:', orgUsersError);
          setError(`org_users query error: ${orgUsersError.message}`);
        } else {
          console.log('[DEBUG] org_users result:', orgUsersData);
          setOrgUsers(orgUsersData || []);
        }

        // If we have org memberships, query organizations
        if (orgUsersData && orgUsersData.length > 0) {
          const orgIds = orgUsersData.map(ou => ou.org_id);
          console.log('[DEBUG] Querying organizations for org IDs:', orgIds);
          
          const { data: orgsData, error: orgsError } = await supabase
            .from('organizations')
            .select('id, name, created_at')
            .in('id', orgIds);

          if (orgsError) {
            console.error('[DEBUG] organizations query error:', orgsError);
            const errMsg = `organizations query error: ${orgsError.code || orgsError.message}`;
            setError(prev => prev || errMsg);
          } else {
            console.log('[DEBUG] organizations result (array):', orgsData);
            if (Array.isArray(orgsData)) {
              setOrganizations(orgsData);
            } else {
              console.warn('[DEBUG] organizations query did not return array:', orgsData);
            }
          }
        }

      } catch (err) {
        console.error('[DEBUG] Unexpected error:', err);
        setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    }

    fetchDebugData();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 p-8">
        <h1 className="text-2xl font-bold mb-8">Auth Debug Panel</h1>
        <div>Loading debug data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-8">
      <h1 className="text-2xl font-bold mb-8">Auth Debug Panel</h1>

      {error && (
        <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded mb-6">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="space-y-8">
        {/* Auth User Info */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Auth User</h2>
          <pre className="bg-slate-900 p-4 rounded text-sm overflow-x-auto">
            {JSON.stringify({
              id: user?.id,
              email: user?.email,
              role: (user?.user_metadata as any)?.role,
              created_at: user?.created_at,
              last_sign_in_at: user?.last_sign_in_at,
            }, null, 2)}
          </pre>
        </div>

        {/* Supabase URL */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Supabase Configuration</h2>
          <div className="bg-slate-900 p-4 rounded text-sm">
            <strong>URL:</strong> {supabaseUrl}
          </div>
        </div>

        {/* org_users Query Result */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">org_users Query Result</h2>
          <div className="mb-4">
            <strong>Query:</strong> SELECT org_id, user_id, role FROM org_users WHERE user_id = '{user?.id}'
          </div>
          <div className="mb-4">
            <strong>Count:</strong> {orgUsers.length}
          </div>
          <pre className="bg-slate-900 p-4 rounded text-sm overflow-x-auto">
            {JSON.stringify(orgUsers, null, 2)}
          </pre>
        </div>

        {/* organizations Query Result */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">organizations Query Result</h2>
          <div className="mb-4">
            <strong>Query:</strong> SELECT id, name, created_at FROM organizations WHERE id IN ({orgUsers.map(ou => `'${ou.org_id}'`).join(', ')})
          </div>
          <div className="mb-4">
            <strong>Count:</strong> {organizations.length}
          </div>
          <pre className="bg-slate-900 p-4 rounded text-sm overflow-x-auto">
            {JSON.stringify(organizations, null, 2)}
          </pre>
        </div>

        {/* Analysis */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Analysis</h2>
          <div className="space-y-2">
            <div><strong>User authenticated:</strong> {user ? 'Yes' : 'No'}</div>
            <div><strong>org_users membership:</strong> {orgUsers.length > 0 ? 'Found' : 'None'}</div>
            <div><strong>Organizations resolved:</strong> {organizations.length > 0 ? 'Yes' : 'No'}</div>
            {orgUsers.length > 0 && organizations.length === 0 && (
              <div className="text-yellow-400">
                ⚠️  Warning: User has org memberships but organizations query returned empty. This suggests RLS policy issues.
              </div>
            )}
            {orgUsers.length === 0 && (
              <div className="text-red-400">
                ❌ User has no org memberships. This explains "No organization linked" message.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}