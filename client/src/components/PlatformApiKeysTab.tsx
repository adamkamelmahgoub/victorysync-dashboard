import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';

type PlatformApiKey = {
  id: string;
  name: string;
  created_at: string;
  last_used_at?: string | null;
};

export const PlatformApiKeysTab: React.FC = () => {
  const [keys, setKeys] = useState<PlatformApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/platform-api-keys`);
      const json = await res.json();
      if (res.ok) setKeys(json);
      else console.error('Failed to fetch platform keys', json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const createKey = async () => {
    setCreating(true);
    setNewToken(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/platform-api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (res.ok) {
        // API returns the plaintext token once
        setNewToken(json.token);
        fetchKeys();
        setName('');
      } else {
        console.error('Failed to create platform key', json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Delete this platform API key?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/platform-api-keys/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) fetchKeys();
      else console.error('Failed to delete platform key');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <h3>Platform API Keys</h3>
      <div style={{ marginBottom: 12 }}>
        <input placeholder="Key name" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={createKey} disabled={creating || !name}>Create</button>
      </div>

      {newToken && (
        <div style={{ marginBottom: 12 }}>
          <strong>New Token (copy now):</strong>
          <div style={{ padding: 8, background: '#f6f6f6', wordBreak: 'break-all' }}>{newToken}</div>
        </div>
      )}

      {loading ? (
        <div>Loading keys…</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td>{new Date(k.created_at).toLocaleString()}</td>
                <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}</td>
                <td>
                  <button onClick={() => deleteKey(k.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default PlatformApiKeysTab;
