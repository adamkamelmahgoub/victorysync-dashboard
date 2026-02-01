import React, { FC, useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Organization {
  id: string;
  name: string;
  created_at: string;
}

const AdminOrgsPage: FC = () => {
  const { user } = useAuth();
  const userId = user?.id;
  
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');

  useEffect(() => {
    fetchOrgs();
  }, []);

  const fetchOrgs = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:4000/api/admin/orgs', {
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        console.error(`Error: ${errData.error || 'Failed to fetch orgs'}`);
        return;
      }

      const data = await response.json();
      setOrgs(data.organizations || []);
    } catch (error) {
      console.error('Error fetching orgs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMightyCallSync = async () => {
    try {
      setSyncing(true);
      setSyncResult('');

      const response = await fetch('http://localhost:4000/api/admin/mightycall/sync', {
        method: 'POST',
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        setSyncResult(`Error: ${errData.error || 'Sync failed'}`);
        alert('Sync failed');
        return;
      }

      const data = await response.json();
      const resultText = `✓ Sync complete!\n\nPhones: ${data.phones || 0}\nExtensions: ${data.extensions || 0}\nReports: ${data.reports || 0}`;
      setSyncResult(resultText);
      alert(resultText);
    } catch (error) {
      console.error('Error syncing:', error);
      setSyncResult('Error: Failed to sync');
      alert('Failed to sync with MightyCall');
    } finally {
      setSyncing(false);
    }
  };

  if (!userId) {
    return (
      <div className="p-8 text-center text-red-400">
        <p>Not authenticated. Please log in first.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">Admin - Organizations</h1>
        <button
          onClick={handleMightyCallSync}
          disabled={syncing}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white font-semibold rounded transition"
        >
          {syncing ? '⏳ Syncing...' : '🔄 Sync MightyCall'}
        </button>
      </div>

      {syncResult && (
        <div className="mb-6 p-4 bg-slate-800 border border-slate-700 rounded text-slate-300 whitespace-pre-line">
          {syncResult}
        </div>
      )}

      <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading organizations...</div>
        ) : orgs.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No organizations found</div>
        ) : (
          <div className="divide-y divide-slate-700">
            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-800 font-semibold text-slate-300">
              <div>Name</div>
              <div>Created</div>
              <div>Actions</div>
            </div>
            {orgs.map((org) => (
              <div key={org.id} className="grid grid-cols-3 gap-4 p-4 hover:bg-slate-800/50 transition">
                <div className="text-white font-semibold">{org.name}</div>
                <div className="text-slate-400 text-sm">
                  {new Date(org.created_at).toLocaleDateString()}
                </div>
                <div className="text-slate-400">
                  <button className="text-blue-400 hover:text-blue-300 text-sm">View Details</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminOrgsPage;
