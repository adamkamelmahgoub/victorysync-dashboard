import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { API_BASE_URL } from '../config';

type PlatformApiKey = {
  id: string;
  label?: string | null;
  created_at: string;
  last_used_at?: string | null;
};

export const PlatformApiKeysTab: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [keys, setKeys] = useState<PlatformApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchKeys();
  }, [user?.id]);

  const fetchKeys = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/platform-api-keys`, {
        headers: { 'x-user-id': user.id },
      });
      const json = await res.json();
      if (res.ok && json.keys) {
        setKeys(json.keys);
      } else {
        setError(json.error || 'Failed to fetch platform keys');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch keys');
      console.error('fetchKeys error:', err);
    } finally {
      setLoading(false);
    }
  };

  const createKey = async () => {
    if (!user?.id || !name.trim()) {
      setError('Name is required');
      return;
    }
    setCreating(true);
    setNewToken(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/platform-api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (res.ok && json.token) {
        setNewToken(json.token);
        setName('');
        setError(null);
        if (toast) {
          toast.success('API key created! Copy the token now (it won\'t be shown again)');
        }
        fetchKeys();
      } else {
        setError(json.error || 'Failed to create API key');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create key';
      setError(message);
      console.error('createKey error:', err);
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (id: string) => {
    if (!user?.id) return;
    if (!confirm('Delete this platform API key?')) return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/platform-api-keys/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user.id },
      });
      if (res.ok) {
        if (toast) {
          toast.success('API key deleted');
        }
        fetchKeys();
      } else {
        const json = await res.json();
        setError(json.error || 'Failed to delete key');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete key';
      setError(message);
      console.error('deleteKey error:', err);
    }
  };

  return (
    <div className="rounded-2xl bg-slate-900/80 ring-1 ring-slate-800 p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm mb-3">Platform API Keys</h3>
        <p className="text-xs text-slate-400 mb-4">
          Manage API keys for platform-level access. Keys are shown only once when created.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Key name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createKey()}
          className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
        />
        <button
          onClick={createKey}
          disabled={creating || !name.trim() || !user?.id}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-sm text-white rounded-lg transition font-medium"
        >
          {creating ? 'Creating...' : 'Create Key'}
        </button>
      </div>

      {newToken && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <p className="text-xs font-semibold text-emerald-300 mb-2">
            ✓ API Key Created (copy now, won't be shown again):
          </p>
          <div
            onClick={() => {
              navigator.clipboard.writeText(newToken);
              if (toast) toast.success('Copied to clipboard');
            }}
            className="p-3 bg-slate-800/80 rounded border border-emerald-500/20 font-mono text-xs text-emerald-200 overflow-auto max-h-32 cursor-pointer hover:bg-slate-800 transition"
          >
            {newToken}
          </div>
          <p className="text-xs text-emerald-300/70 mt-2">Click to copy</p>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-slate-400">Loading keys...</div>
      ) : keys.length === 0 ? (
        <div className="text-xs text-slate-400 italic">No platform API keys created yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-300">Name</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-300">Created</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-300">Last Used</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-slate-800/50 transition">
                  <td className="px-3 py-2 text-slate-200">{k.label || '(unnamed)'}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {new Date(k.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => deleteKey(k.id)}
                      className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2 transition"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PlatformApiKeysTab;
