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
      <div className="vs-surface p-4">
        <h3 className="text-sm font-semibold text-slate-950">API Keys</h3>
        <p className="mt-3 text-sm text-slate-600">Only organization admins can manage API keys.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <h3 className="text-sm font-semibold text-rose-900">API Keys</h3>
        <p className="mt-3 text-sm text-rose-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="vs-surface space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-950">API Keys</h3>
        <button
          onClick={() => setShowNewKeyModal(true)}
          className="vs-button-primary !px-3 !py-1.5 !text-xs"
        >
          Create Key
        </button>
      </div>

      {/* Created key display */}
      {createdKey && (
        <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-semibold text-emerald-800">API Key Created</p>
          <p className="text-sm text-slate-700">
            Label: <span className="font-mono">{createdKey.key.label || 'Untitled'}</span>
          </p>
          <div className="rounded-xl border border-emerald-200 bg-white p-3">
            <p className="mb-1 text-xs font-semibold text-slate-600">Your API key, shown once</p>
            <code className="break-all font-mono text-xs text-emerald-700">{createdKey.apiKey}</code>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(createdKey.apiKey);
              alert('Copied to clipboard!');
            }}
            className="text-xs font-semibold text-emerald-700 underline"
          >
            Copy to clipboard
          </button>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Close
          </button>
        </div>
      )}

      {/* Create key modal */}
      {showNewKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h4 className="text-sm font-semibold text-slate-950">Create API Key</h4>
            <input
              type="text"
              placeholder="Key label (e.g., 'Third-party API')"
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              className="vs-input w-full"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowNewKeyModal(false);
                  setNewKeyLabel('');
                }}
                className="vs-button-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateKey}
                disabled={creatingKey || !newKeyLabel.trim()}
                className="vs-button-primary flex-1"
              >
                {creatingKey ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys list */}
      {loading ? (
        <p className="text-sm text-slate-600">Loading keys...</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-slate-600">No API keys created yet.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between space-y-1 rounded-2xl border border-slate-200 bg-white p-3 text-xs shadow-sm">
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">{key.label || 'Untitled'}</span>
                  <span className="text-slate-500 text-[10px]">
                    {new Date(key.created_at).toLocaleDateString()}
                  </span>
                </div>
                {key.last_used_at && (
                  <div className="mt-1 text-slate-600">
                    Last used: {new Date(key.last_used_at).toLocaleString()}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDeleteKey(key.id)}
                className="ml-2 flex-shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
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
