import { useEffect, useState } from 'react';
import { API_BASE_URL, buildApiUrl } from '../config';
import { fetchJson } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

export interface Agent {
  id: string;
  email: string;
  org_id: string | null;
  role: string;
  created_at: string;
}

export function useAgents() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const json = await fetchJson(buildApiUrl('/api/admin/agents'), { headers: { 'x-user-id': user?.id || '' } });
        if (!cancelled) {
          setAgents(json.agents || []);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error('Error loading agents:', e);
          setError(e?.message ?? 'Failed to load agents');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { agents, loading, error };
}
