import * as React from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getOrgMembers } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

interface Agent {
  id: string;
  email: string;
  role: string;
  extension: string | null;
}

export default function AgentsTab({ orgId }: { orgId: string }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newExt, setNewExt] = useState('');

  useEffect(() => {
    fetchAgents();
    // eslint-disable-next-line
  }, [orgId]);

  async function fetchAgents() {
    setLoading(true);
    setError(null);
    // Use server endpoint to get members and filter agents/org_managers
    try {
      const json = await getOrgMembers(orgId, user?.id);
      const rows = json.members || [];
      const filtered = (rows || []).filter((r: any) => ['agent', 'org_manager'].includes(r.role));
      // Fetch extensions from server and merge
      let extensions: any[] = [];
      try {
        const extResp = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/agent-extensions`, { headers: { 'x-user-id': user?.id || '' } });
        if (extResp.ok) {
          const ej = await extResp.json();
          extensions = ej.extensions || [];
        }
      } catch (_) {}
      const extMap: Record<string,string> = {};
      for (const e of extensions) extMap[e.user_id] = e.extension;
      setAgents(filtered.map((m: any) => ({ id: m.user_id, email: m.email || '', role: m.role, extension: extMap[m.user_id] || '' })));
    } catch (e: any) {
      if (e?.status === 404) {
        setApiUnavailable(true);
        setError('Members API unavailable (404). Server endpoints may not be deployed; agent list may be incomplete.');
      } else if (e?.status === 401) {
        setError('Unauthenticated. Please sign in and try again.');
      } else if (e?.status === 403) {
        setError('Access forbidden. You lack the permissions to view agents.');
      } else {
        setError(e?.message || 'Failed to load agents');
      }
    }
    setLoading(false);
  }

  async function handleEdit(agentId: string, currentExt: string) {
    setEditing(agentId);
    setNewExt(currentExt || '');
  }

  async function handleSave(agent: Agent) {
    setError(null);
    if (!newExt.trim()) {
      setError('Extension cannot be empty');
      return;
    }
    try {
      // Check uniqueness via server-side helper (returns 400 if duplicate)
      const resp = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/agents/${encodeURIComponent(agent.id)}/extension`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify({ extension: newExt.trim() })
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error((body && (body.detail || body.error || body.message)) || `HTTP ${resp.status}`);
      }
      setEditing(null);
      setNewExt('');
      fetchAgents();
    } catch (e: any) {
      setError(e?.message || 'Failed to save extension');
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Agents & Extensions</h2>
        <div className="text-sm text-gray-400">Agents assigned to this organization</div>
      </div>
      {apiUnavailable && (
        <div className="mb-4 p-3 bg-rose-900/30 text-rose-300 rounded">Members API unavailable (404). Server endpoints may not be deployed; agent list may be incomplete.</div>
      )}
      {error && <div className="text-rose-400 mb-2">{error}</div>}
      {loading ? (
        <div className="py-6 text-center text-sm text-gray-400">Loading agents...</div>
      ) : (
        <div className="bg-slate-900/70 rounded shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-900/60">
              <tr>
                <th className="p-3 text-sm text-slate-300">Email</th>
                <th className="p-3 text-sm text-slate-300">Role</th>
                <th className="p-3 text-sm text-slate-300">Extension</th>
                <th className="p-3 text-sm text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => (
                <tr key={agent.id} className="border-t border-slate-800">
                  <td className="p-3 text-slate-200">{agent.email}</td>
                  <td className="p-3 text-slate-200">{agent.role}</td>
                  <td className="p-3">
                    {editing === agent.id ? (
                      <input
                        className="p-1 rounded bg-slate-800 border border-slate-700 w-32 text-sm text-slate-200"
                        value={newExt}
                        onChange={e => setNewExt(e.target.value)}
                      />
                    ) : (
                      agent.extension || <span className="text-gray-500">(none)</span>
                    )}
                  </td>
                  <td className="p-3">
                    {editing === agent.id ? (
                      <>
                        <button
                          className="px-3 py-1 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded mr-2"
                          onClick={() => handleSave(agent)}
                          disabled={apiUnavailable || !!error && (error.includes('Unauthenticated') || error.includes('Access forbidden'))}
                        >
                          Save
                        </button>
                        <button
                          className="px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="px-3 py-1 text-sm bg-sky-700 hover:bg-sky-800 text-white rounded"
                        onClick={() => handleEdit(agent.id, agent.extension || '')}
                        disabled={apiUnavailable || !!error && (error.includes('Unauthenticated') || error.includes('Access forbidden'))}
                      >
                        Edit
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
  );
}
