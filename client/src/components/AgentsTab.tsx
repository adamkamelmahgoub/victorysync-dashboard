import * as React from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getOrgMembers } from '../lib/apiClient';

interface Agent {
  id: string;
  email: string;
  role: string;
  extension: string | null;
}

export default function AgentsTab({ orgId }: { orgId: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      const json = await getOrgMembers(orgId);
      const rows = json.members || [];
      const filtered = (rows || []).filter((r: any) => ['agent', 'org_manager'].includes(r.role));
      setAgents(filtered.map((m: any) => ({ id: m.user_id, email: m.email || '', role: m.role, extension: '' })));
    } catch (e: any) {
      setError(e?.message || 'Failed to load agents');
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
    // Check uniqueness
    const { data: exists } = await supabase
      .from('agent_extensions')
      .select('id')
      .eq('extension', newExt.trim())
      .neq('user_id', agent.id)
      .maybeSingle();
    if (exists) {
      setError('Extension must be unique');
      return;
    }
    // Upsert using object form (single record)
    const { error: upsertErr } = await supabase.from('agent_extensions').upsert({
      org_id: orgId,
      user_id: agent.id,
      extension: newExt.trim(),
    } as any);
    if (upsertErr) throw upsertErr;
    setEditing(null);
    setNewExt('');
    fetchAgents();
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Agents & Extensions</h2>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <table className="w-full text-left bg-gray-900 rounded">
          <thead>
            <tr>
              <th className="p-2">Email</th>
              <th className="p-2">Role</th>
              <th className="p-2">Extension</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent.id} className="border-t border-gray-800">
                <td className="p-2">{agent.email}</td>
                <td className="p-2">{agent.role}</td>
                <td className="p-2">
                  {editing === agent.id ? (
                    <input
                      className="p-1 rounded bg-gray-900 border border-gray-700 w-24"
                      value={newExt}
                      onChange={e => setNewExt(e.target.value)}
                    />
                  ) : (
                    agent.extension || <span className="text-gray-500">(none)</span>
                  )}
                </td>
                <td className="p-2">
                  {editing === agent.id ? (
                    <>
                      <button
                        className="text-emerald-400 hover:underline text-xs mr-2"
                        onClick={() => handleSave(agent)}
                      >
                        Save
                      </button>
                      <button
                        className="text-gray-400 hover:underline text-xs"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="text-blue-400 hover:underline text-xs"
                      onClick={() => handleEdit(agent.id, agent.extension || '')}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
