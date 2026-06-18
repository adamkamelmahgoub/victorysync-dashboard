import * as React from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getOrgAgentLiveStatus, getOrgMembers, getOrgMightyCallExtensions } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

interface Agent {
  id: string;
  email: string;
  role: string;
  extension: string | null;
}

interface AgentLiveStatus {
  user_id: string;
  extension: string | null;
  display_name?: string | null;
  on_call: boolean;
  counterpart?: string | null;
  status?: string | null;
  started_at?: string | null;
}

interface ExtensionOption {
  extension: string;
  display_name?: string | null;
  sources?: string[];
  is_live?: boolean;
}

function fmtDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export default function AgentsTab({ orgId }: { orgId: string }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [liveStatusByUserId, setLiveStatusByUserId] = useState<Record<string, AgentLiveStatus>>({});
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newExt, setNewExt] = useState('');
  const [extensionOptions, setExtensionOptions] = useState<ExtensionOption[]>([]);
  const [extensionsLoading, setExtensionsLoading] = useState(false);
  const [extensionsError, setExtensionsError] = useState<string | null>(null);
  const [extensionsInfo, setExtensionsInfo] = useState<string | null>(null);
  const [extensionsAudit, setExtensionsAudit] = useState<ExtensionOption[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents();
    fetchAvailableExtensions();
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
      const nextAgents = filtered.map((m: any) => ({ id: m.user_id, email: m.email || '', role: m.role, extension: extMap[m.user_id] || m.mightycall_extension || '' }));
      setAgents(nextAgents);
      fetchLiveStatuses();
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

  async function fetchLiveStatuses() {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const json = await getOrgAgentLiveStatus(orgId, user?.id);
      const rows = json.items || [];
      const nextMap: Record<string, AgentLiveStatus> = {};
      for (const row of rows) nextMap[row.user_id] = row;
      setLiveStatusByUserId(nextMap);
      setRefreshedAt(json.refreshed_at || new Date().toISOString());
    } catch (e: any) {
      setLiveError(e?.message || 'Failed to load live agent status');
    } finally {
      setLiveLoading(false);
    }
  }

  async function fetchAvailableExtensions() {
    setExtensionsLoading(true);
    setExtensionsError(null);
    setExtensionsInfo(null);
    try {
      const json = await getOrgMightyCallExtensions(orgId, user?.id, { liveOnly: true });
      const liveOptions = (json.extensions || []) as ExtensionOption[];
      const fallbackOptions = (json.fallback_extensions || []) as ExtensionOption[];
      const nextOptions = liveOptions.length > 0 ? liveOptions : fallbackOptions;
      setExtensionOptions(nextOptions);
      setExtensionsAudit((json.hidden_extensions || []) as ExtensionOption[]);
      if (!json.live_fetch_ok) {
        setExtensionsError(json.live_fetch_error || 'Live extensions could not be loaded');
      } else if (!liveOptions.length && fallbackOptions.length) {
        setExtensionsInfo('No live extensions were returned for this organization, so saved extensions are shown instead.');
      } else if (!liveOptions.length) {
        setExtensionsError('No live extensions were returned for this organization.');
      }
    } catch (e: any) {
      setExtensionsError(e?.message || 'Failed to load extensions');
    } finally {
      setExtensionsLoading(false);
    }
  }

  async function handleEdit(agentId: string, currentExt: string) {
    setEditing(agentId);
    setNewExt(currentExt || '');
    if (extensionOptions.length === 0) {
      fetchAvailableExtensions();
    }
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
      fetchLiveStatuses();
      fetchAvailableExtensions();
    } catch (e: any) {
      setError(e?.message || 'Failed to save extension');
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Agents & Extensions</h2>
        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-600">
            {liveLoading ? 'Refreshing live status...' : `Live status ${refreshedAt ? `updated ${fmtDateTime(refreshedAt)}` : 'not loaded yet'}`}
          </div>
          <button
            className="vs-button-secondary !px-3 !py-1.5 !text-xs"
            onClick={() => fetchAvailableExtensions()}
            disabled={extensionsLoading || apiUnavailable}
          >
            {extensionsLoading ? 'Loading extensions...' : 'Refresh Extensions'}
          </button>
          <button
            className="vs-button-secondary !px-3 !py-1.5 !text-xs"
            onClick={() => fetchLiveStatuses()}
            disabled={liveLoading || apiUnavailable}
          >
            {liveLoading ? 'Refreshing...' : 'Refresh Live'}
          </button>
        </div>
      </div>
      {apiUnavailable && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Members API unavailable (404). Server endpoints may not be deployed; agent list may be incomplete.</div>
      )}
      {error && <div className="mb-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {liveError && <div className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{liveError}</div>}
      {extensionsError && <div className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{extensionsError}</div>}
      {extensionsInfo && <div className="mb-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">{extensionsInfo}</div>}
      {!extensionsError && extensionsAudit.length > 0 && (
        <div className="mb-2 text-sm text-slate-600">
          Hidden {extensionsAudit.length} stale saved extension{extensionsAudit.length === 1 ? '' : 's'} that are not currently live.
        </div>
      )}
      {loading ? (
        <div className="py-6 text-center text-sm text-slate-600">Loading agents...</div>
      ) : (
        <div className="vs-table-shell overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-sm text-slate-700">Email</th>
                <th className="p-3 text-sm text-slate-700">Role</th>
                <th className="p-3 text-sm text-slate-700">Extension</th>
                <th className="p-3 text-sm text-slate-700">Live</th>
                <th className="p-3 text-sm text-slate-700">On Call With</th>
                <th className="p-3 text-sm text-slate-700">Call Status</th>
                <th className="p-3 text-sm text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => {
                const live = liveStatusByUserId[agent.id];
                return (
                <tr key={agent.id} className="border-t border-slate-100 hover:bg-violet-50/40">
                  <td className="p-3 text-slate-900">{agent.email}</td>
                  <td className="p-3 text-slate-700">{agent.role}</td>
	                  <td className="p-3">
	                    {editing === agent.id ? (
	                      <select
	                        className="vs-input min-w-[180px] !p-1"
	                        value={newExt}
	                        onChange={e => setNewExt(e.target.value)}
	                      >
	                        <option value="">Select extension</option>
	                        {extensionOptions.map((option) => (
	                          <option key={option.extension} value={option.extension}>
	                            {option.display_name ? `${option.extension} - ${option.display_name}` : option.extension}
	                          </option>
	                        ))}
	                      </select>
	                    ) : (
	                      agent.extension || <span className="text-slate-500">(none)</span>
	                    )}
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      live?.on_call ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-slate-200 bg-slate-100 text-slate-700'
                    }`}>
                      {live?.on_call ? 'On Call' : (live?.status || 'Idle')}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-slate-700">{live?.counterpart || '—'}</td>
                  <td className="p-3 text-sm text-slate-700">
                    <div>{live?.status || '—'}</div>
                    {live?.started_at && <div className="text-xs text-slate-500">Started {fmtDateTime(live.started_at)}</div>}
                  </td>
                  <td className="p-3">
                    {editing === agent.id ? (
                      <>
                        <button
                          className="vs-button-primary mr-2 !px-3 !py-1.5 !text-xs"
                          onClick={() => handleSave(agent)}
                          disabled={apiUnavailable || !!error && (error.includes('Unauthenticated') || error.includes('Access forbidden'))}
                        >
                          Save
                        </button>
                        <button
                          className="vs-button-secondary !px-3 !py-1.5 !text-xs"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="vs-button-primary !px-3 !py-1.5 !text-xs"
                        onClick={() => handleEdit(agent.id, agent.extension || '')}
                        disabled={apiUnavailable || !!error && (error.includes('Unauthenticated') || error.includes('Access forbidden'))}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
