const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '..', 'server', '.env') });

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  MIGHTYCALL_API_KEY,
  MIGHTYCALL_USER_KEY,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in server/.env');
}
if (!MIGHTYCALL_API_KEY || !MIGHTYCALL_USER_KEY) {
  throw new Error('Missing MIGHTYCALL_API_KEY or MIGHTYCALL_USER_KEY in server/.env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const mightycall = require(path.resolve(__dirname, '..', 'server', 'dist', 'integrations', 'mightycall.js'));

const POLL_MS = 1500;
const STALE_MS = 10000;
const LOG_FILE = path.resolve(__dirname, '..', 'tmp', 'live_presence_bridge.log');
const SYNC_VERSION = 'local-presence-bridge-v1';
const RUN_ONCE = process.argv.includes('--once');
const USER_IDENTITY_TTL_MS = 5 * 60 * 1000;

let mightycallTokenCache = { token: null, expiresAt: 0 };
const userIdentityCache = new Map();

function ensureTmpDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(message, extra) {
  ensureTmpDir();
  const line = `[${new Date().toISOString()}] ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}`;
  fs.appendFileSync(LOG_FILE, `${line}\n`);
  console.log(line);
}

function normalizeStatusLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Available';
  const lower = raw.toLowerCase();
  if (lower.includes('connect') || lower.includes('call')) return 'Connected';
  if (lower.includes('busy')) return 'Busy';
  if (lower.includes('away')) return 'Away';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function isActiveStatus(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (!normalized) return false;
  if ([
    'available',
    'idle',
    'offline',
    'disconnected',
    'completed',
    'ended',
    'end',
    'missed',
    'failed',
    'canceled',
    'cancelled',
    'done',
    'closed',
    'wrapup',
    'wrap_up',
    'after_call',
  ].some((token) => normalized.includes(token))) {
    return false;
  }
  return ['ring', 'talk', 'active', 'progress', 'connect', 'answer', 'hold', 'queue', 'call', 'busy'].some((token) => normalized.includes(token));
}

function pickCounterpart(liveCall, extension) {
  if (!liveCall || !liveCall.currentCall) return null;
  const call = liveCall.currentCall;
  const ext = String(extension || '').trim();
  const candidates = [
    call.called?.number,
    call.called?.phoneNumber,
    call.called?.address,
    call.callee?.number,
    call.client?.number,
    call.client?.address,
    call.recipient,
    call.to_number,
    call.to,
    call.from_number,
    call.from,
  ];
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (!text) continue;
    if (text === ext) continue;
    if (text.replace(/\D/g, '') === ext.replace(/\D/g, '')) continue;
    return text;
  }
  return null;
}

async function getMightyCallTokenCached() {
  const now = Date.now();
  if (mightycallTokenCache.token && mightycallTokenCache.expiresAt > now + 5000) {
    return mightycallTokenCache.token;
  }
  const token = await mightycall.getMightyCallAccessToken();
  mightycallTokenCache = {
    token,
    // Conservative TTL: refresh every 50 minutes.
    expiresAt: now + (50 * 60 * 1000),
  };
  return token;
}

async function getAgentAssignments() {
  const { data, error } = await supabase
    .from('org_users')
    .select('org_id, user_id, role, mightycall_extension')
    .eq('role', 'agent')
    .not('mightycall_extension', 'is', null);
  if (error) throw error;

  return (data || []).map((row) => {
    return {
      org_id: row.org_id,
      user_id: row.user_id,
      extension: String(row.mightycall_extension || '').trim(),
      display_name: null,
      email: null,
    };
  }).filter((row) => row.org_id && row.user_id && row.extension);
}

async function enrichIdentity(assignments) {
  const userIds = Array.from(new Set(assignments.map((row) => row.user_id)));
  if (userIds.length === 0) return assignments;

  const { data: profileRows, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);
  if (error) throw error;

  const byId = new Map((profileRows || []).map((row) => [String(row.id), row]));
  const withProfiles = assignments.map((row) => {
    const profile = byId.get(String(row.user_id));
    return {
      ...row,
      display_name: row.display_name || profile?.full_name || null,
      email: row.email || null,
    };
  });

  const enriched = [];
  for (const row of withProfiles) {
    let next = { ...row };
    const cachedIdentity = userIdentityCache.get(String(row.user_id));
    if (cachedIdentity && cachedIdentity.expiresAt > Date.now()) {
      next.email = next.email || cachedIdentity.email || null;
      next.display_name = next.display_name || cachedIdentity.display_name || null;
      enriched.push(next);
      continue;
    }

    if (!next.email || !next.display_name) {
      try {
        const authRes = await supabase.auth.admin.getUserById(String(row.user_id));
        const authUser = authRes?.data?.user;
        const metadata = authUser?.user_metadata || {};
        if (!next.email) next.email = authUser?.email || metadata?.email || null;
        if (!next.display_name) {
          next.display_name =
            metadata?.full_name ||
            metadata?.name ||
            metadata?.display_name ||
            authUser?.email?.split('@')?.[0] ||
            null;
        }
        userIdentityCache.set(String(row.user_id), {
          email: next.email || null,
          display_name: next.display_name || null,
          expiresAt: Date.now() + USER_IDENTITY_TTL_MS,
        });
      } catch {}
    }
    enriched.push(next);
  }

  return enriched;
}

async function buildPresenceRows(assignments) {
  const token = await getMightyCallTokenCached();
  const now = new Date();
  const refreshedAt = now.toISOString();
  const staleAfter = new Date(now.getTime() + STALE_MS).toISOString();

  const rows = [];
  for (const agent of assignments) {
    const [liveCall, profileStatus] = await Promise.all([
      mightycall.fetchMightyCallLiveCallByExtension(agent.extension, token).catch(() => null),
      mightycall.fetchMightyCallProfileStatusByExtension(agent.extension, token).catch(() => null),
    ]);

    const statusSignal = profileStatus?.status || profileStatus?.label || null;
    const onCall = !!liveCall?.onCall || isActiveStatus(statusSignal);
    const startedAt = onCall
      ? liveCall?.startedAt || liveCall?.currentCall?.dateTimeUtc || refreshedAt
      : null;
    const rawStatus = onCall
      ? (liveCall?.status || liveCall?.currentCall?.callStatus || statusSignal || 'Connected')
      : 'available';

    rows.push({
      org_id: agent.org_id,
      user_id: agent.user_id,
      extension: agent.extension,
      email: agent.email || null,
      display_name: agent.display_name || null,
      on_call: onCall,
      status: onCall ? 'Connected' : normalizeStatusLabel(rawStatus),
      counterpart: onCall ? pickCounterpart(liveCall, agent.extension) : null,
      started_at: startedAt,
      source: onCall
        ? (liveCall?.onCall ? 'local_presence_bridge_live_call' : 'local_presence_bridge_profile_status')
        : 'local_presence_bridge_status',
      raw_status: rawStatus || null,
      last_seen_at: refreshedAt,
      refreshed_at: refreshedAt,
      stale_after: staleAfter,
      sync_version: SYNC_VERSION,
      updated_at: refreshedAt,
    });
  }

  return rows;
}

async function pruneRows(assignments) {
  const orgIds = Array.from(new Set(assignments.map((row) => row.org_id)));
  if (orgIds.length === 0) return;

  const userIds = assignments.map((row) => row.user_id);
  const { data: existingRows, error } = await supabase
    .from('live_agent_presence')
    .select('org_id, user_id')
    .in('org_id', orgIds);
  if (error) throw error;

  const staleRows = (existingRows || []).filter((row) => !userIds.includes(String(row.user_id || '')));
  for (const staleRow of staleRows) {
    await supabase
      .from('live_agent_presence')
      .delete()
      .eq('org_id', staleRow.org_id)
      .eq('user_id', staleRow.user_id);
  }
}

async function syncOnce() {
  const assignments = await enrichIdentity(await getAgentAssignments());
  const rows = await buildPresenceRows(assignments);
  if (rows.length > 0) {
    const { error } = await supabase
      .from('live_agent_presence')
      .upsert(rows, { onConflict: 'org_id,user_id' });
    if (error) throw error;
  }
  await pruneRows(assignments);
  log('sync_complete', {
    rows: rows.length,
    on_call: rows.filter((row) => row.on_call).length,
    refreshed_at: rows[0]?.refreshed_at || new Date().toISOString(),
  });
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await syncOnce();
  } catch (error) {
    log('sync_failed', { message: error?.message || String(error) });
  } finally {
    running = false;
  }
}

log('bridge_start', { poll_ms: POLL_MS, sync_version: SYNC_VERSION, once: RUN_ONCE });
if (RUN_ONCE) {
  tick().then(() => process.exit(0));
} else {
  tick();
  setInterval(tick, POLL_MS);
}
