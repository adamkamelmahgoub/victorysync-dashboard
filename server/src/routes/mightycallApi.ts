import express from 'express';
import { isOrgMember, isPlatformAdmin } from '../auth/rbac';
import { supabaseAdmin } from '../lib/supabaseClient';
import { runLiveStatusSync, runMightyCallSync } from '../mightycall/sync';

const router = express.Router();

async function getActor(req: express.Request) {
  const actorId = req.header('x-user-id') || (req as any).actorId || null;
  if (!actorId) {
    const err = new Error('unauthenticated') as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return String(actorId);
}

async function getUserOrgIds(actorId: string) {
  const { data, error } = await supabaseAdmin.from('org_users').select('org_id').eq('user_id', actorId);
  if (error) throw error;
  return Array.from(new Set((data || []).map((row: any) => String(row.org_id)).filter(Boolean)));
}

async function getLiveStatusOrgIds() {
  const { data } = await supabaseAdmin
    .from('agent_live_status')
    .select('org_id')
    .not('org_id', 'is', null)
    .limit(1000);
  return Array.from(new Set((data || []).map((row: any) => String(row.org_id)).filter(Boolean)));
}

async function resolveOrgScope(req: express.Request) {
  const actorId = await getActor(req);
  const requestedOrgId = String(req.query.org_id || req.body?.orgId || req.body?.org_id || '').trim();
  const admin = await isPlatformAdmin(actorId);
  if (admin) return { actorId, admin, orgIds: requestedOrgId ? [requestedOrgId] : await getLiveStatusOrgIds() };
  const orgIds = await getUserOrgIds(actorId);
  if (requestedOrgId) {
    if (!orgIds.includes(requestedOrgId)) {
      const err = new Error('forbidden') as Error & { status?: number };
      err.status = 403;
      throw err;
    }
    return { actorId, admin, orgIds: [requestedOrgId] };
  }
  return { actorId, admin, orgIds: orgIds.slice(0, 1) };
}

function liveStatusLabel(status: string) {
  switch (status) {
    case 'ringing': return 'Ringing';
    case 'dialing': return 'Dialing';
    case 'on_call': return 'On Call';
    case 'on_hold': return 'On Hold';
    case 'transferring': return 'Transferring';
    case 'available': return 'Available';
    case 'offline': return 'Offline';
    case 'dnd': return 'Do Not Disturb';
    default: return status || 'Unknown';
  }
}

function mapLiveRow(row: any, orgNames: Map<string, string>) {
  const status = String(row.normalized_status || row.status || 'unknown').toLowerCase();
  const active = ['ringing', 'dialing', 'on_call', 'on_hold', 'transferring'].includes(status);
  const direction = row.current_call_direction || row.direction || null;
  const counterpart = direction === 'outbound'
    ? (row.to_number || row.current_counterpart_number || null)
    : (row.from_number || row.current_counterpart_number || null);
  return {
    user_id: row.user_id || '',
    org_id: row.org_id || null,
    organization_name: orgNames.get(String(row.org_id || '')) || null,
    email: null,
    role: 'agent',
    extension: row.mightycall_extension || row.extension || null,
    display_name: row.agent_name || row.raw_payload?.userInfo?.displayName || row.raw_payload?.userInfo?.name || null,
    on_call: active,
    status: liveStatusLabel(status),
    raw_status: row.raw_status || null,
    direction: active ? direction : null,
    from_number: active ? row.from_number || null : null,
    to_number: active ? row.to_number || null : null,
    business_number: row.business_number || null,
    counterpart: active ? counterpart : null,
    started_at: active ? (row.status_started_at || row.started_at || null) : null,
    answered_at: row.answered_at || null,
    ended_at: row.ended_at || null,
    last_seen_at: row.last_synced_at || row.last_event_at || row.updated_at || null,
    refreshed_at: row.last_synced_at || row.updated_at || null,
    stale: false,
    source: row.source || 'mightycall_api_poll',
    api_source: 'local_db_api_poll',
  };
}

router.get('/live-status', async (req, res) => {
  try {
    const scope = await resolveOrgScope(req);
    if (scope.orgIds.length === 0) return res.json({ items: [], refreshed_at: new Date().toISOString(), source: 'local_db_api_poll' });
    const { data, error } = await supabaseAdmin
      .from('agent_live_status')
      .select('*')
      .in('org_id', scope.orgIds)
      .order('mightycall_extension', { ascending: true });
    if (error) throw error;
    const { data: orgs } = await supabaseAdmin.from('organizations').select('id, name').in('id', scope.orgIds);
    const orgNames = new Map((orgs || []).map((row: any) => [String(row.id), String(row.name || '')]));
    const items = (data || []).map((row: any) => mapLiveRow(row, orgNames));
    const refreshedAt = items.map((item: any) => item.refreshed_at).filter(Boolean).sort().slice(-1)[0] || new Date().toISOString();
    res.json({
      items,
      refreshed_at: refreshedAt,
      source: 'local_db_api_poll',
      live_status_version: 'api-only-db-read',
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'live_status_failed' });
  }
});

router.post('/live-status/sync', async (req, res) => {
  try {
    await getActor(req);
    const result = await runLiveStatusSync('manual-live-status');
    res.json(result);
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'live_status_sync_failed' });
  }
});

router.post('/mightycall/sync', async (req, res) => {
  try {
    const actorId = await getActor(req);
    const orgId = String(req.query.org_id || req.body?.orgId || req.body?.org_id || '').trim();
    if (orgId && !(await isPlatformAdmin(actorId)) && !(await isOrgMember(actorId, orgId))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const result = await runMightyCallSync('manual-full-sync');
    res.json(result);
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'mightycall_sync_failed' });
  }
});

export default router;
