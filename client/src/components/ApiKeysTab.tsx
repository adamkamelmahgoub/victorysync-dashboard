import { useState, useEffect } from 'react';
import { API_BASE_URL, buildApiUrl } from '../config';
import { getOrgApiKeys, createOrgApiKey, deleteOrgApiKey } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

interface ApiKey {
  id: string;
  label: string | null;
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
}

interface ApiKeysTabProps {
  orgId: string;
  isOrgAdmin: boolean;
}

export function ApiKeysTab({ orgId, isOrgAdmin }: ApiKeysTabProps) {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [createdKey, setCreatedKey] = useState<{ apiKey: string; key: ApiKey } | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);

  // Fetch keys
  const fetchKeys = async () => {
    if (!orgId || !isOrgAdmin) return;
    try {
      setLoading(true);
      setError(null);
      const json = await getOrgApiKeys(orgId, user?.id);
      setKeys(json.keys || []);
    } catch (e: any) {
      console.error('Error loading API keys:', e);
      setError(e.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [orgId, isOrgAdmin]);

  const handleCreateKey = async () => {
    if (!orgId || !newKeyLabel.trim()) {
      setError('Please enter a label');
      return;
    }

    try {
      setCreatingKey(true);
      setError(null);
      const json = await createOrgApiKey(orgId, newKeyLabel.trim(), user?.id);
      // fetchJson throws on non-ok; if we are here, creation succeeded
      setCreatedKey(json);
      setNewKeyLabel('');
      setShowNewKeyModal(false);
      await fetchKeys();
    } catch (e: any) {
      console.error('Error creating API key:', e);
      setError(e.message || 'Failed to create API key');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Delete this API key?')) return;
    try {
      await deleteOrgApiKey(orgId, id, user?.id);
      await fetchKeys();
    } catch (e: any) {
      console.error('Error deleting API key:', e);
      setError(e.message || 'Failed to delete API key');
    }
  };

  if (!isOrgAdmin) {
    return (
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <h3 className="text-sm font-medium text-slate-200">API Keys</h3>
        <p className="mt-3 text-xs text-slate-400">Only organization admins can manage API keys.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <h3 className="text-sm font-medium text-slate-200">API Keys</h3>
        <p className="mt-3 text-xs text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">API Keys</h3>
        <button
          onClick={() => setShowNewKeyModal(true)}
          className="px-3 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 rounded transition"
        >
          Create Key
        </button>
      </div>

      {/* Created key display */}
      {createdKey && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded space-y-2">
          <p className="text-xs font-medium text-emerald-300">API Key Created!</p>
          <p className="text-xs text-slate-300">
            Label: <span className="font-mono">{createdKey.key.label || 'Untitled'}</span>
          </p>
          <div className="bg-slate-950 rounded p-2">
            <p className="text-xs text-slate-400 mb-1">Your API Key (save this, it won't be shown again):</p>
            <code className="text-xs text-emerald-400 break-all font-mono">{createdKey.apiKey}</code>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(createdKey.apiKey);
              alert('Copied to clipboard!');
            }}
            className="text-xs text-emerald-400 hover:text-emerald-300 underline"
          >
            Copy to clipboard
          </button>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-xs text-slate-400 hover:text-slate-300"
          >
            Close
          </button>
        </div>
      )}

      {/* Create key modal */}
      {showNewKeyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-lg p-6 max-w-sm w-full mx-4 space-y-4">
            <h4 className="text-sm font-semibold text-slate-200">Create API Key</h4>
            <input
              type="text"
              placeholder="Key label (e.g., 'Third-party API')"
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowNewKeyModal(false);
                  setNewKeyLabel('');
                }}
                className="flex-1 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateKey}
                disabled={creatingKey || !newKeyLabel.trim()}
                className="flex-1 px-3 py-2 text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed rounded transition"
              >
                {creatingKey ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys list */}
      {loading ? (
        <p className="text-xs text-slate-400">Loading keys...</p>
      ) : keys.length === 0 ? (
        <p className="text-xs text-slate-400">No API keys created yet.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.id} className="p-3 bg-slate-800/50 rounded text-xs space-y-1 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-200">{key.label || 'Untitled'}</span>
                  <span className="text-slate-500 text-[10px]">
                    {new Date(key.created_at).toLocaleDateString()}
                  </span>
                </div>
                {key.last_used_at && (
                  <div className="text-slate-400 mt-1">
                    Last used: {new Date(key.last_used_at).toLocaleString()}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDeleteKey(key.id)}
                className="ml-2 px-2 py-1 text-xs text-red-400 hover:text-red-300 bg-red-900/20 rounded transition flex-shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
