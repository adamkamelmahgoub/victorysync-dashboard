import { useEffect, useState } from 'react';
import { fetchJson } from '../lib/apiClient';

interface APIKey {
  id: string;
  name: string;
  key?: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export default function OrgAPIKeysTab({ orgId, isOrgAdmin }: { orgId: string; isOrgAdmin: boolean }) {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setApiKeys([]);
    setRevealedKeys(new Set());
    setNewKeyName('');
    setShowForm(false);
    loadAPIKeys();
  }, [orgId]);

  const loadAPIKeys = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchJson(`/api/orgs/${orgId}/api-keys`);
      setApiKeys((data.keys || []).map((row: any) => ({ id: row.id, name: row.label || 'Unnamed key', created_at: row.created_at, last_used_at: row.last_used_at, is_active: true })));
    } catch (e) {
      setError('Failed to load API keys');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const createAPIKey = async () => {
    if (!newKeyName.trim()) {
      setError('API key name required');
      return;
    }

    try {
      setError(null);
      
      // Try to create via API endpoint first
      const response = await fetch(`/api/orgs/${orgId}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newKeyName }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Failed to create API key' }));
        setError(body.error || 'Failed to create API key');
        return;
      }

      const result = await response.json();
      const newKey: APIKey = { id: result.key.id, name: result.key.label || 'Unnamed key', key: result.apiKey, created_at: result.key.created_at, last_used_at: null, is_active: true };
      setApiKeys([newKey, ...apiKeys]);
      setNewKeyName('');
      setShowForm(false);
      setRevealedKeys(new Set([...revealedKeys, newKey.id]));
    } catch (e) {
      setError('Failed to create API key');
      console.error(e);
    }
  };

  const revokeAPIKey = async (keyId: string) => {
    if (!window.confirm('Are you sure? This will immediately invalidate the key.')) return;

    try {
      setError(null);
      const response = await fetch(`/api/orgs/${orgId}/api-keys/${keyId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Failed to revoke key' }));
        setError(body.error || 'Failed to revoke key');
        return;
      }

      setApiKeys(apiKeys.filter(k => k.id !== keyId));
    } catch (e) {
      setError('Failed to revoke API key');
      console.error(e);
    }
  };

  const toggleRevealKey = (keyId: string) => {
    setRevealedKeys(new Set(
      revealedKeys.has(keyId)
        ? Array.from(revealedKeys).filter(id => id !== keyId)
        : [...revealedKeys, keyId]
    ));
  };

  if (loading) return <div className="text-center text-slate-400">Loading API keys...</div>;

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="bg-rose-900/20 border border-rose-800 rounded-lg p-4">
          <p className="text-rose-400 text-sm">{error}</p>
          <button className="vs-btn vs-btn-secondary mt-2" onClick={loadAPIKeys}>Retry</button>
        </div>
      )}

      {/* Info Box */}
      <div className="vs-surface rounded-lg p-4">
        <p className="text-[var(--vs-text)] text-sm">
          Copy a new key before leaving this page. Existing keys cannot be revealed again. Keep keys secret and rotate them regularly.
        </p>
      </div>

      {/* Create New Key */}
      {isOrgAdmin && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-emerald-100 rounded-lg text-sm font-medium transition-colors"
            >
              + Create New API Key
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-300 mb-2">Key Name</label>
                <input
                  aria-label="Key name"
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Integration Name"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 placeholder-slate-500 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={createAPIKey}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-emerald-100 rounded text-sm font-medium transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setNewKeyName('');
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* API Keys List */}
      {apiKeys.length === 0 ? (
        <div className="text-center text-slate-400">
          {isOrgAdmin ? 'No API keys yet. Create one to get started.' : 'No API keys available.'}
        </div>
      ) : (
        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div key={key.id} className="bg-slate-900 border border-slate-700 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="text-slate-200 font-medium">{key.name}</h4>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="bg-slate-800 px-2 py-1 rounded text-xs text-slate-300 font-mono flex-1 block overflow-x-auto">
                        {key.key ? (revealedKeys.has(key.id) ? key.key : '••••••••••••••••') : 'Stored securely. Rotate to obtain a new key.'}
                      </code>
                      <button
                        disabled={!key.key}
                        onClick={() => toggleRevealKey(key.id)}
                        className="px-2 py-1 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                      >
                        {revealedKeys.has(key.id) ? 'Hide' : 'Show'}
                      </button>
                      <button
                        disabled={!key.key}
                        onClick={() => {
                          if (key.key) void navigator.clipboard.writeText(key.key).catch(() => setError('Copy failed. Select and copy the revealed key manually.'));
                        }}
                        className="px-2 py-1 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="flex gap-4 text-xs text-slate-400">
                      <span>Created: {new Date(key.created_at).toLocaleDateString()}</span>
                      {key.last_used_at && (
                        <span>Last used: {new Date(key.last_used_at).toLocaleDateString()}</span>
                      )}
                      <span className={key.is_active ? 'text-emerald-400' : 'text-rose-400'}>
                        {key.is_active ? 'Active' : 'Revoked'}
                      </span>
                    </div>
                  </div>
                </div>
                {isOrgAdmin && key.is_active && (
                  <button
                    onClick={() => revokeAPIKey(key.id)}
                    className="px-3 py-1 bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 rounded text-sm transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
