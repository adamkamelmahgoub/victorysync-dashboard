import React, { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../lib/apiClient';

type Status = {
  available: boolean; enabled: boolean; polling: boolean; running: boolean; server_enabled: boolean;
  rows: { client_id: string; last_success_at: string | null; last_error: string | null; phase: string; page_offset: number }[];
};
export function MightyCallTransferSync({ clients, routeCount, assignmentCount }: {
  clients: Record<string, any>[]; routeCount: number; assignmentCount: number;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const result = await fetchJson('/api/workforce/transfer-sync');
    setStatus({ ...result, rows: result.rows || [] });
  }, []);
  useEffect(() => {
    let active = true;
    const poll = () => refresh().catch(e => { if (active) setError(e.message); });
    void poll();
    const timer = setInterval(poll, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [refresh]);
  async function request(path: string, body: object, message: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await fetchJson(`/api/workforce/transfer-sync/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      await refresh(); setNotice(message);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="vs-surface wf-transfer-sync" aria-label="MightyCall transfer import">
    <div className="wf-sync-heading">
      <div><h2>MightyCall transfers</h2><p>Pull transfers automatically from your connected phone account.</p></div>
      <span>{!status ? 'Checking connection' : !status.available ? 'Setup required' : status.running ? 'Importing' : status.enabled && status.polling ? 'Automatic import on' : status.enabled ? 'Background worker stopped' : 'Automatic import off'}</span>
    </div>
    {status && !status.available && <p>Apply migration 055 and deploy the API server to enable automatic imports.</p>}
    {status?.available && <>
      {(!routeCount || !assignmentCount) && <p>Add active provider routes and matching agent campaign assignments in Administration before importing.</p>}
      {status.enabled && !status.polling && <p>Automatic imports need a running API background worker. Check the server polling configuration.</p>}
      <div className="wf-sync-actions">
        <button disabled={busy || !routeCount || !assignmentCount || status.server_enabled} onClick={() => request('enabled', { enabled: !status.enabled }, status.enabled ? 'Automatic import paused.' : 'Automatic import enabled. The worker checks every minute.')}>{status.enabled ? 'Pause automatic import' : 'Enable automatic import'}</button>
        <button disabled={busy || status.running || !routeCount || !assignmentCount} onClick={() => request('run', {}, 'Import requested. Progress refreshes every 10 seconds.')}>Sync now</button>
      </div>
      {status.server_enabled && <p>Automatic import is managed by the API server environment.</p>}
      {status.rows.length === 0 && <p>No import attempts yet.</p>}
      <ul className="wf-sync-clients">{status.rows.map(row => <li key={row.client_id}>
        <strong>{clients.find(c => c.id === row.client_id)?.name || 'Client'}</strong>
        <p>{row.last_error || `Next: ${row.phase === 'calls' ? 'call history' : 'call journal'}, records ${row.page_offset + 1} onward.`}</p>
        <p>{row.last_success_at ? `Last completed scan: ${new Date(row.last_success_at).toLocaleString()}` : 'First scan has not completed.'}</p>
      </li>)}</ul>
      <p>Transfers missing timing or agent mapping appear in the Audit review inbox. Qualifying details can be added after import.</p>
    </>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
