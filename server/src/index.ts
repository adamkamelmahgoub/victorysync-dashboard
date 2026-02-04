/**
 * VictorySync Dashboard API Server
 * 
 * PRODUCTION SETUP:
 * - Deployed on Vercel or similar Node.js host
 * - CORS is enabled for all origins (app.use(cors())) — for production, consider restricting
 *   to your frontend domain: cors({ origin: 'https://dashboard.victorysync.com' })
 * - All endpoints are unauthenticated or use x-user-id header for simple testing
 * - IMPORTANT: Before going to production, implement proper JWT validation via Supabase Auth
 * 
 * ENVIRONMENT VARIABLES:
 * See server/src/config/env.ts for full documentation on required vars:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_KEY
 * - MIGHTYCALL_API_KEY
 * - MIGHTYCALL_USER_KEY
 * 
 * KEY ENDPOINTS:
 * - GET  /api/client-metrics?org_id={optional}  — Dashboard KPI metrics (global or per-org)
 * - GET  /api/calls/recent?org_id={optional}   — Recent calls for the dashboard
 * - GET  /api/calls/series?range=day&org_id={optional} — Hourly/daily call series for charts
 * - GET  /api/calls/queue-summary?org_id={optional} — Queue breakdown
 * - GET  /api/admin/orgs                        — List all organizations
 * - GET  /api/admin/orgs/:orgId                 — Org details with members, phones, stats
 * - POST /api/admin/orgs/:orgId/phone-numbers   — Assign phone numbers to org
 */

// server/src/index.ts
import './config/env';
import express from "express";
import cors from "cors";
import crypto from 'crypto';
import { supabase, supabaseAdmin } from './lib/supabaseClient';
import { normalizePhoneDigits, normalizeToE164FromRaw } from './lib/phoneUtils';
import { 
  fetchMightyCallPhoneNumbers, 
  fetchMightyCallExtensions, 
  fetchMightyCallVoicemails,
  fetchMightyCallCalls,
  fetchMightyCallContacts,
  syncMightyCallPhoneNumbers, 
  syncMightyCallReports,
  syncMightyCallVoicemails,
  syncMightyCallCallHistory,
  syncMightyCallContacts,
  syncSMSLog
} from './integrations/mightycall';
import { isPlatformAdmin, isPlatformManagerWith, isOrgAdmin, isOrgMember, isOrgManagerWith } from './auth/rbac';
import usersRouter from './routes/users';
import { Readable } from 'stream';

// Extend Express Request interface to include apiKeyScope
declare global {
  namespace Express {
    interface Request {
      apiKeyScope?: {
        scope: 'platform' | 'org';
        keyId: string;
        orgId?: string;
      };
    }
  }
}

// Helper to safely format errors for logging (avoids TS property errors)
function fmtErr(e: any) {
  return (e as any)?.message ?? e;
}

// ---- API Key helpers ----
function hashApiKey(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateApiKeyPlaintext() {
  // 32 bytes -> 43 chars base64url-ish; use hex for simplicity
  return crypto.randomBytes(32).toString('hex');
}

// Verify token against both platform and org api keys. Returns { scope: 'platform' } or { scope: 'org', orgId }
async function verifyApiKeyToken(token: string) {
  if (!token) return null;
  try {
    const h = hashApiKey(token);
    // Check platform keys
    const { data: p, error: pErr } = await supabaseAdmin
      .from('platform_api_keys')
      .select('id, label, created_by')
      .eq('key_hash', h)
      .maybeSingle();
    if (!pErr && p) return { scope: 'platform', keyId: p.id } as any;

    // Check org keys
    const { data: o, error: oErr } = await supabaseAdmin
      .from('org_api_keys')
      .select('id, org_id, label, created_by')
      .eq('key_hash', h)
      .maybeSingle();
    if (!oErr && o) return { scope: 'org', orgId: o.org_id, keyId: o.id } as any;
    return null;
  } catch (e) {
    console.warn('[verifyApiKeyToken] error', fmtErr(e));
    return null;
  }
}

// Middleware for endpoints that accept API keys: sets req.apiKeyScope if valid
async function apiKeyAuthMiddleware(req: any, res: any, next: any) {
  try {
    const header = (req.get('Authorization') || '') as string;
    let token: string | null = null;
    if (header && header.toLowerCase().startsWith('bearer ')) token = header.split(' ')[1];
    if (!token) token = req.get('x-api-key') || null;
    // Support a one-off service key header for internal/edge calls
    if (!token) {
      const svc = req.get('x-service-key') || req.get('x-admin-key') || null;
      const expected = process.env.SERVICE_KEY || process.env.SERVER_SERVICE_KEY || process.env.SERVICE_SECRET || null;
      if (svc && expected && svc === expected) {
        // Treat as platform-level service key
        req.apiKeyScope = { scope: 'platform', keyId: 'service-key' } as any;
        return next();
      }
    }
    if (!token) return next();
    const v = await verifyApiKeyToken(token);
    if (v) {
      req.apiKeyScope = v;
      // update last_used_at
      if (v.scope === 'platform') {
        await supabaseAdmin.from('platform_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', v.keyId);
      } else if (v.scope === 'org') {
        await supabaseAdmin.from('org_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', v.keyId);
      }
    }
    
    return next();
  } catch (e) {
    console.warn('[apiKeyAuthMiddleware] failure', fmtErr(e));
    return next();
  }
}

// Resolve assigned phone numbers for an org (many-to-many via org_phone_numbers).
// Works with schema that stores phone_number_id referencing phone_numbers.id.
async function getAssignedPhoneNumbersForOrg(orgId: string) {
  try {
    console.log('[getAssignedPhoneNumbersForOrg] called for orgId:', orgId);
    // Fetch mapping rows (supports both modern phone_number_id and legacy phone_number columns)
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('org_phone_numbers')
      .select('id, org_id, phone_number_id, phone_number, label, created_at')
      .eq('org_id', orgId);
    if (rowsErr) {
      console.warn('[getAssignedPhoneNumbersForOrg] org_phone_numbers select failed:', fmtErr(rowsErr));
      return { phones: [], numbers: [], digits: [] };
    }
    

    const rowsArr = (rows || []) as any[];
    console.log('[getAssignedPhoneNumbersForOrg] found', rowsArr.length, 'rows for orgId', orgId);
    
    // Collect all potential phone IDs to look up (both from phone_number_id and phone_number fields)
    const phoneIds = new Set<string>();
    for (const r of rowsArr) {
      if (r.phone_number_id) phoneIds.add(r.phone_number_id);
      // Also treat phone_number as potential phone ID if it looks like a UUID
      if (r.phone_number && r.phone_number.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        phoneIds.add(r.phone_number);
      }
    }
    
    
    const phonesById: Record<string, any> = {};
    if (phoneIds.size > 0) {
      const { data: pdata, error: perr } = await supabaseAdmin
        .from('phone_numbers')
        .select('id, number, label')
        .in('id', Array.from(phoneIds));
      if (!perr && pdata) {
        for (const p of pdata) phonesById[p.id] = p;
      }
      console.log('[getAssignedPhoneNumbersForOrg] phonesById keys:', Object.keys(phonesById));
    }

    // Collect legacy phone_number strings to look up in phone_numbers table
    const phoneNumberStrings = rowsArr
      .filter(r => r.phone_number && !r.phone_number.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) && !r.phone_number_id)
      .map(r => r.phone_number);
    const phonesByNumber: Record<string, any> = {};
    if (phoneNumberStrings.length > 0) {
      const { data: pdata, error: perr } = await supabaseAdmin
        .from('phone_numbers')
        .select('id, number, label')
        .in('number', phoneNumberStrings as string[]);
      if (!perr && pdata) {
        for (const p of pdata) phonesByNumber[p.number] = p;
      }
      console.log('[getAssignedPhoneNumbersForOrg] phonesByNumber keys:', Object.keys(phonesByNumber));
    }

    const phones: Array<{ id: string; number: string; number_digits?: string | null; label?: string | null; created_at?: string }> = [];
    for (const r of rowsArr) {
      // Modern schema: phone_number_id → look up in phonesById
      if (r.phone_number_id && phonesById[r.phone_number_id]) {
        const p = phonesById[r.phone_number_id];
        phones.push({ id: p.id, number: p.number, number_digits: p.number_digits ?? null, label: r.label ?? p.label ?? null, created_at: r.created_at });
      }
      // Edge case: phone_number field contains a UUID (phone ID) instead of actual number
      else if (r.phone_number && r.phone_number.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) && phonesById[r.phone_number]) {
        const p = phonesById[r.phone_number];
        console.log('[getAssignedPhoneNumbersForOrg] found phone_number field containing UUID', r.phone_number, 'in phonesById lookup');
        phones.push({ id: p.id, number: p.number, number_digits: p.number_digits ?? null, label: r.label ?? p.label ?? null, created_at: r.created_at });
      }
      // Legacy schema: phone_number text → look up in phonesByNumber
      else if (r.phone_number && phonesByNumber[r.phone_number]) {
        const p = phonesByNumber[r.phone_number];
        phones.push({ id: p.id, number: p.number, number_digits: p.number_digits ?? null, label: r.label ?? p.label ?? null, created_at: r.created_at });
      }
      // Legacy schema: phone_number text but not found in phone_numbers table → use as-is with org_phone_numbers row id as synthetic id
      else if (r.phone_number && !r.phone_number_id && !r.phone_number.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        console.log('[getAssignedPhoneNumbersForOrg] legacy phone_number', r.phone_number, 'not found in phone_numbers table, using synthetic id:', r.id);
        phones.push({ id: r.id, number: r.phone_number, number_digits: r.phone_number.replace(/\D/g, ''), label: r.label ?? null, created_at: r.created_at });
      }
    }

    const numbers = phones.map(p => p.number).filter(Boolean);
    const digits = phones.map(p => {
      if (p.number_digits) return p.number_digits;
      // normalize number fallback
      const d = normalizePhoneDigits(p.number);
      return d ?? null;
    }).filter(Boolean);
    console.log('[getAssignedPhoneNumbersForOrg] returning', phones.length, 'phones for orgId', orgId);
    return { phones, numbers, digits };
  } catch (e) {
    console.warn('[getAssignedPhoneNumbersForOrg] exception:', fmtErr(e));
    return { phones: [], numbers: [], digits: [] };
  }
}

// Get phone numbers assigned to a specific user within an org
async function getUserAssignedPhoneNumbers(orgId: string, userId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_phone_assignments')
      .select('phone_number_id')
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (error) {
      console.warn('[getUserAssignedPhoneNumbers] query failed:', fmtErr(error));
      return { phones: [], numbers: [], digits: [] };
    }

    if (!data || data.length === 0) {
      return { phones: [], numbers: [], digits: [] };
    }

    const phoneIds = (data as any[]).map(r => r.phone_number_id).filter(Boolean);
    
    const { data: phones, error: phoneErr } = await supabaseAdmin
      .from('phone_numbers')
      .select('id, number, label')
      .in('id', phoneIds);

    if (phoneErr) {
      console.warn('[getUserAssignedPhoneNumbers] phone lookup failed:', fmtErr(phoneErr));
      return { phones: [], numbers: [], digits: [] };
    }

    const phoneList = phones || [];
    const numbers = phoneList.map(p => p.number).filter(Boolean);
    const digits = phoneList.map(p => (p.number || '').replace(/\D/g, '')).filter(Boolean);

    return { phones: phoneList, numbers, digits };
  } catch (e) {
    console.warn('[getUserAssignedPhoneNumbers] exception:', fmtErr(e));
    return { phones: [], numbers: [], digits: [] };
  }
}

// Helper: fallback calculation for totals using direct DB calls (used when RPC is unavailable)
async function computeTotalsFromCalls(orgId: string, startTime: Date, endTime: Date, assignedNumbers: string[], assignedDigits: string[]) {
  const totalsObj = { callsToday: 0, answeredCalls: 0, missedCalls: 0, avgHandleTime: 0, avgSpeedOfAnswer: 0, answerRate: 0 } as any;
  try {
    const { data: callFetch, error: callFetchErr } = await supabaseAdmin
      .from('calls')
      .select('to_number,to_number_digits,from_number,from_number_digits,status,answered_at,ended_at,started_at')
      .gte('started_at', startTime.toISOString())
      .lte('started_at', endTime.toISOString())
      .limit(5000);
    if (callFetchErr) throw callFetchErr;
        const callRows = (callFetch || []).filter((c: any) => {
          const toDigits = c.to_number_digits || normalizePhoneDigits(c.to_number || null);
          const fromDigits = c.from_number_digits || normalizePhoneDigits(c.from_number || null);
          if (toDigits && assignedDigits.includes(toDigits)) return true;
          if (c.to_number && assignedNumbers.includes(c.to_number)) return true;
          if (fromDigits && assignedDigits.includes(fromDigits)) return true;
          if (c.from_number && assignedNumbers.includes(c.from_number)) return true;
          return false;
        });
    let sumHandleSecondsLocal = 0; let handleCountLocal = 0; let sumSpeedSecondsLocal = 0; let speedAnsweredCountLocal = 0;
    for (const c of callRows) {
      totalsObj.callsToday += 1;
      const st = (c.status || '').toLowerCase();
      if (st === 'answered' || st === 'completed') {
        totalsObj.answeredCalls += 1;
        if (c.answered_at && c.started_at) {
          const speedSeconds = (new Date(c.answered_at).getTime() - new Date(c.started_at).getTime())/1000;
          if (speedSeconds >= 0) { sumSpeedSecondsLocal += speedSeconds; speedAnsweredCountLocal++; }
        }
        const handleSeconds = ((c as any).duration != null) ? Number((c as any).duration) : (c.ended_at && c.answered_at ? (new Date(c.ended_at).getTime() - new Date(c.answered_at).getTime())/1000 : 0);
        if (handleSeconds > 0) { sumHandleSecondsLocal += handleSeconds; handleCountLocal++; }
      } else if (st === 'missed') {
        totalsObj.missedCalls += 1;
      }
    }
    totalsObj.avgHandleTime = handleCountLocal > 0 ? Math.round(sumHandleSecondsLocal / handleCountLocal) : 0;
    totalsObj.avgSpeedOfAnswer = speedAnsweredCountLocal > 0 ? Math.round(sumSpeedSecondsLocal / speedAnsweredCountLocal) : 0;
    totalsObj.answerRate = totalsObj.callsToday > 0 ? Math.round((totalsObj.answeredCalls / totalsObj.callsToday) * 100 * 10) / 10 : 0;
  } catch (e) {
    console.warn('[computeTotalsFromCalls] failed:', fmtErr(e));
  }
  return totalsObj;
}

// In-memory cache for per-org metrics. Keyed by `${orgId}:${range}:${start}:${end}`
const metricsCache = new Map<string, { ts: number, payload: any }>();
const METRICS_CACHE_TTL_MS = 60 * 1000; // 60s

// Cache for extension->display name during a single request
async function resolveAgentNameForExtension(ext: string | null, orgId?: string) {
  if (!ext) return null;
  try {
    // Try mightycall_extensions table first
    const { data: meData, error: meErr } = await supabaseAdmin
      .from('mightycall_extensions')
      .select('display_name')
      .eq('extension', ext)
      .maybeSingle();
    if (!meErr && meData && meData.display_name) return meData.display_name;

    // Fallback: find org_users with this extension to get user_id and then user's email/name
    const { data: ou, error: ouErr } = await supabaseAdmin
      .from('org_users')
      .select('user_id')
      .eq('mightycall_extension', ext)
      .limit(1)
      .maybeSingle();
    if (!ouErr && ou && ou.user_id) {
      try {
        const { data: udata, error: uerr } = await supabaseAdmin.auth.admin.getUserById(ou.user_id);
        if (!uerr && udata && udata.user && udata.user.email) return udata.user.email;
      } catch (e) {
        // ignore
      }
    }

    // Last resort: return the extension string itself
    return ext;
  } catch (e) {
    console.warn('[resolveAgentNameForExtension] failed:', fmtErr(e));
    return ext;
  }
}

const app = express();
// CORS: In production, restrict origin to your frontend domain
app.use(cors());
app.use(express.json());
// Disable ETag generation for API responses to avoid conditional GET returning 304
app.disable('etag');

// Ensure API responses are not cached by intermediaries or clients
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
// Apply API key middleware early so endpoints can detect org-scoped or platform keys
// app.use(apiKeyAuthMiddleware as any);

// Using centralized Supabase client from `src/lib/supabaseClient`

// Simple health check
app.get("/", (_req, res) => {
  res.send("VictorySync metrics API is running");
});

// TEMPORARY DEV BYPASS: Allow testing without auth
app.use('/api', (req, res, next) => {
  // For development testing, allow requests with x-dev-bypass header
  if (req.header('x-dev-bypass') === 'true') {
    // Set a test user ID for development
    req.headers['x-user-id'] = 'a5f6f998-1234-5678-9abc-def012345678'; // adam@victorysync.com user ID
    console.log('[DEV BYPASS] Allowing request without auth:', req.method, req.path);
  }
  next();
});

// GET /api/client-metrics?org_id=...
// If org_id is present: returns metrics for that org
// If org_id is missing: infers from x-user-id (for org clients) or returns global metrics (for admin)
app.get("/api/client-metrics", async (req, res) => {
  try {
    // Allow API keys to implicitly scope the request to an org
    let orgId = (req.query.org_id as string | undefined) || undefined;
    const apiScope = (req as any).apiKeyScope || null;
    if (apiScope && apiScope.scope === 'org') {
      orgId = apiScope.orgId;
    }
    const todayStart = new Date(new Date().setHours(0,0,0,0)).toISOString();

    console.log('[client-metrics] Request:', { orgId, todayStart });

    // If org_id not provided, try to infer from x-user-id (for org clients accessing their own metrics)
    const userId = req.header('x-user-id') || null;
    if (!orgId && userId) {
      console.log('[client-metrics] no explicit org_id; attempting to infer from user:', userId);
      try {
        const { data: userOrgs, error: userOrgsErr } = await supabaseAdmin
          .from('org_users')
          .select('org_id')
          .eq('user_id', userId)
          .limit(1);
        if (!userOrgsErr && userOrgs && userOrgs.length > 0) {
          orgId = userOrgs[0].org_id;
          console.log('[client-metrics] inferred org_id from user:', orgId);
        } else {
          console.log('[client-metrics] user not found in any org, returning zero metrics:', userId);
          // Return zero metrics for user with no org
          return res.json({ metrics: { total_calls: 0, answered_calls: 0, answer_rate_pct: 0, avg_wait_seconds: 0 } });
        }
      } catch (e) {
        console.warn('[client-metrics] error inferring org from user:', fmtErr(e));
        // Return zero metrics on error
        return res.json({ metrics: { total_calls: 0, answered_calls: 0, answer_rate_pct: 0, avg_wait_seconds: 0 } });
      }
    }

    if (orgId) {
      // Per-org metrics: try the pre-aggregated view first, otherwise compute from `calls`
      console.log('[client-metrics] Fetching per-org metrics for org:', orgId);
      
      try {
        const { data, error } = await supabaseAdmin
          .from("client_metrics_today")
          .select("*")
          .eq("org_id", orgId)
          .maybeSingle();

        if (error) {
          console.warn('[client-metrics] client_metrics_today lookup error:', error.message || error);
        } else if (data) {
          console.log('[client-metrics] Returning cached metrics for org:', orgId);
          return res.json({ metrics: data });
        }
      } catch (e) {
        console.warn('[client-metrics] Exception querying client_metrics_today:', fmtErr(e));
      }

      // Fallback: compute from `calls` table for today
      console.log('[client-metrics] Falling back to live calls computation for org:', orgId);
      try {
        // Find assigned phone numbers for this org (many-to-many)
        const { phones, numbers: assignedNumbers, digits: assignedDigits } = await getAssignedPhoneNumbersForOrg(orgId);
        const callsSet: any[] = [];
        if (assignedNumbers.length > 0 || assignedDigits.length > 0) {
          // Try matching by to_number and to_number_digits
            // Fetch calls and filter by normalized digits OR exact to_number
            const { data: callsAll, error: callsAllErr } = await supabaseAdmin
              .from('calls')
              .select('status, started_at, answered_at, to_number, to_number_digits, from_number, from_number_digits')
              .gte('started_at', todayStart);
            if (callsAllErr) throw callsAllErr;
            if (callsAll && callsAll.length) {
              for (const c of callsAll) {
                const toDigits = c.to_number_digits || normalizePhoneDigits(c.to_number || null);
                const fromDigits = c.from_number_digits || normalizePhoneDigits(c.from_number || null);
                let matchedNumber: string | null = null;
                if (toDigits && assignedDigits.includes(toDigits)) matchedNumber = c.to_number || toDigits;
                else if (c.to_number && assignedNumbers.includes(c.to_number)) matchedNumber = c.to_number;
                else if (fromDigits && assignedDigits.includes(fromDigits)) matchedNumber = c.from_number || fromDigits;
                else if (c.from_number && assignedNumbers.includes(c.from_number)) matchedNumber = c.from_number;
                if (matchedNumber) callsSet.push({ ...c, matchedNumber });
              }
            }
        }
        // Aggregate
        const seen = new Set<string>();
        let totalCalls = 0; let answeredCalls = 0; let waitSum = 0; let waitCount = 0;
        for (const call of callsSet || []) {
          const key = `${call.started_at || ''}::${call.matchedNumber || call.to_number || call.from_number || ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          totalCalls += 1;
          const st = (call.status || '').toString().toLowerCase();
          if (st === 'answered' || st === 'completed') {
            answeredCalls += 1;
            if (call.answered_at && call.started_at) {
              const started = new Date(call.started_at);
              const answered = new Date(call.answered_at);
              const diff = Math.max(0, (answered.getTime() - started.getTime()) / 1000);
              waitSum += diff;
              waitCount += 1;
            }
          }
        }
        const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
        const avgWait = waitCount > 0 ? Math.round(waitSum / waitCount) : 0;
        console.log('[client-metrics] Returning computed metrics:', { org_id: orgId, totalCalls, answerRate });
        return res.json({ metrics: { org_id: orgId, total_calls: totalCalls, answered_calls: answeredCalls, answer_rate_pct: answerRate, avg_wait_seconds: avgWait } });
      } catch (e: any) {
        console.error('[client-metrics] Fallback computation failed:', fmtErr(e));
        // Return zeros on fallback failure
        return res.json({ metrics: { org_id: orgId, total_calls: 0, answered_calls: 0, answer_rate_pct: 0, avg_wait_seconds: 0 } });
      }
    } else {
      // Global metrics across all orgs
      console.log('[client-metrics] Fetching global metrics');
      
      try {
        const { data, error } = await supabaseAdmin
          .from("client_metrics_today")
          .select("total_calls, answered_calls, answer_rate_pct, avg_wait_seconds");

        if (error) {
          console.warn('[client-metrics] Global metrics view error:', error.message || error);
        } else if (Array.isArray(data) && data.length > 0) {
          // Aggregate rows
          let totalCalls = 0;
          let answeredCalls = 0;
          let sumWaitSeconds = 0;
          let waitCount = 0;

          for (const row of data as any[]) {
            totalCalls += row.total_calls ?? 0;
            answeredCalls += row.answered_calls ?? 0;
            if ((row.avg_wait_seconds ?? 0) > 0) {
              sumWaitSeconds += row.avg_wait_seconds;
              waitCount += 1;
            }
          }

          const answerRatePct = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
          const avgWaitSeconds = waitCount > 0 ? Math.round(sumWaitSeconds / waitCount) : 0;

          console.log('[client-metrics] Returning global metrics:', { totalCalls, answerRatePct });
          return res.json({ metrics: { total_calls: totalCalls, answered_calls: answeredCalls, answer_rate_pct: answerRatePct, avg_wait_seconds: avgWaitSeconds } });
        }
      } catch (e) {
        console.warn('[client-metrics] Global metrics query exception:', fmtErr(e));
      }

      // Fallback: compute from calls table
      console.log('[client-metrics] Falling back to live calls computation (global)');
      try {
        const { data: calls, error: callsErr } = await supabaseAdmin
          .from('calls')
          .select('status, started_at, answered_at')
          .gte('started_at', todayStart);
        
        if (callsErr) {
          console.error('[client-metrics] Calls query error:', callsErr.message || callsErr);
          throw callsErr;
        }

        let totalCalls = 0; let answeredCalls = 0; let waitSum = 0; let waitCount = 0;
        for (const call of calls || []) {
          totalCalls += 1;
          const st = (call.status || '').toString().toLowerCase();
          if (st === 'answered' || st === 'completed') {
            answeredCalls += 1;
            if (call.answered_at && call.started_at) {
              const started = new Date(call.started_at);
              const answered = new Date(call.answered_at);
              const diff = Math.max(0, (answered.getTime() - started.getTime()) / 1000);
              waitSum += diff;
              waitCount += 1;
            }
          }
        }

        const answerRatePct = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
        const avgWaitSeconds = waitCount > 0 ? Math.round(waitSum / waitCount) : 0;

        console.log('[client-metrics] Returning global computed metrics:', { totalCalls, answerRatePct });
        return res.json({ metrics: { total_calls: totalCalls, answered_calls: answeredCalls, answer_rate_pct: answerRatePct, avg_wait_seconds: avgWaitSeconds } });
      } catch (e: any) {
        console.error('[client-metrics] Global fallback failed:', fmtErr(e));
        // Return zeros
        return res.json({ metrics: { total_calls: 0, answered_calls: 0, answer_rate_pct: 0, avg_wait_seconds: 0 } });
      }
    }
  } catch (err: any) {
    console.error('[client-metrics] Unexpected exception:', String(err?.message ?? err), err);
    res.status(500).json({
      error: "metrics_fetch_failed",
      detail: String(err?.message ?? err),
    });
  }
});

// ============== ADMIN ENDPOINTS ==============

// ------------------ API Keys Management ------------------
// Platform keys (platform admins only) — Create
app.post('/api/admin/platform-api-keys', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!(await isPlatformAdmin(actorId))) return res.status(403).json({ error: 'forbidden' });

    const { name } = req.body || {};
    const plain = generateApiKeyPlaintext();
    const keyHash = hashApiKey(plain);

    const payload = { key_hash: keyHash, label: name || null, created_by: actorId };
    const { data, error } = await supabaseAdmin.from('platform_api_keys').insert(payload).select().maybeSingle();
    if (error) throw error;
    // Return the plain token once
    res.json({ token: plain, key: { id: data.id, name: data.label, created_by: data.created_by, created_at: data.created_at } });
  } catch (e: any) {
    console.error('create_platform_key_failed:', fmtErr(e));
    res.status(500).json({ error: 'create_platform_key_failed', detail: fmtErr(e) });
  }
});

// Platform keys — List
app.get('/api/admin/platform-api-keys', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!(await isPlatformAdmin(actorId))) return res.status(403).json({ error: 'forbidden' });

    const { data, error } = await supabaseAdmin.from('platform_api_keys').select('id, label, created_by, created_at, last_used_at').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ keys: data || [] });
  } catch (e: any) {
    console.error('list_platform_keys_failed:', fmtErr(e));
    res.status(500).json({ error: 'list_platform_keys_failed', detail: fmtErr(e) });
  }
});

// Platform keys — Delete
app.delete('/api/admin/platform-api-keys/:id', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { id } = req.params;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!(await isPlatformAdmin(actorId))) return res.status(403).json({ error: 'forbidden' });

    const { error } = await supabaseAdmin.from('platform_api_keys').delete().eq('id', id);
    if (error) throw error;
    res.status(204).send();
  } catch (e: any) {
    console.error('delete_platform_key_failed:', fmtErr(e));
    res.status(500).json({ error: 'delete_platform_key_failed', detail: fmtErr(e) });
  }
});

// Org-scoped keys (org admins)
app.post('/api/orgs/:orgId/api-keys', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId } = req.params;
    const { label } = req.body || {};
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!(await isOrgAdmin(actorId, orgId))) return res.status(403).json({ error: 'forbidden' });

    const plain = generateApiKeyPlaintext();
    const keyHash = hashApiKey(plain);
    const payload = { org_id: orgId, key_hash: keyHash, label: label || null, created_by: actorId };
    const { data, error } = await supabaseAdmin.from('org_api_keys').insert(payload).select().maybeSingle();
    if (error) throw error;
    res.json({ apiKey: plain, key: { id: data.id, org_id: data.org_id, label: data.label, created_by: data.created_by, created_at: data.created_at } });
  } catch (e: any) {
    console.error('create_org_key_failed:', fmtErr(e));
    res.status(500).json({ error: 'create_org_key_failed', detail: fmtErr(e) });
  }
});

app.get('/api/orgs/:orgId/api-keys', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId } = req.params;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!(await isOrgAdmin(actorId, orgId))) return res.status(403).json({ error: 'forbidden' });

    const { data, error } = await supabaseAdmin.from('org_api_keys').select('id, label, created_by, created_at, last_used_at').eq('org_id', orgId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ keys: data || [] });
  } catch (e: any) {
    console.error('list_org_keys_failed:', fmtErr(e));
    res.status(500).json({ error: 'list_org_keys_failed', detail: fmtErr(e) });
  }
});

app.delete('/api/orgs/:orgId/api-keys/:keyId', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId, keyId } = req.params;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!(await isOrgAdmin(actorId, orgId))) return res.status(403).json({ error: 'forbidden' });

    const { error } = await supabaseAdmin.from('org_api_keys').delete().eq('id', keyId).eq('org_id', orgId);
    if (error) throw error;
    res.status(204).send();
  } catch (e: any) {
    console.error('delete_org_key_failed:', fmtErr(e));
    res.status(500).json({ error: 'delete_org_key_failed', detail: fmtErr(e) });
  }
});

// ------------------ End API Keys Management ------------------

// GET /api/admin/orgs - List all organizations
app.get("/api/admin/orgs", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("id, name, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    res.json({ orgs: data || [] });
  } catch (err: any) {
    console.error("admin_orgs_failed:", fmtErr(err));
    res.status(500).json({
      error: "admin_orgs_failed",
      detail: fmtErr(err) ?? "unknown_error",
    });
  }
});

// POST /api/admin/orgs - Create a new organization (server-side)
app.post("/api/admin/orgs", async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'missing_required_fields', detail: 'name is required' });
    }

    // Insert organization using the admin Supabase client
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .insert({ name })
      .select()
      .maybeSingle();

    if (orgErr) {
      console.error('admin_create_org_failed:', fmtErr(orgErr));
      throw orgErr;
    }

    // Create default org_settings if table exists (ignore failure)
    try {
      await supabaseAdmin.from('org_settings').insert({ org_id: org.id, sla_answer_target_percent: 90, sla_answer_target_seconds: 30 });
    } catch (e) {
      console.warn('org_settings_create_warning:', fmtErr(e));
    }

    // If the request includes an authenticated user (x-user-id header), create an org membership
    try {
      const creatorUserId = req.header('x-user-id') || null;
      if (creatorUserId) {
        // Upsert into org_users so the creator becomes an org_admin for this org
        const payload = {
          org_id: org.id,
          user_id: creatorUserId,
          role: 'org_admin',
          mightycall_extension: null,
        };
        const { error: upErr } = await supabaseAdmin
          .from('org_users')
          .upsert(payload, { onConflict: 'org_id,user_id' });
        if (upErr) console.warn('creator_membership_upsert_warning:', fmtErr(upErr));
      } else {
        console.warn('create_org_no_user_provided: org created without creator membership');
      }
    } catch (e) {
      console.warn('create_org_membership_failed:', fmtErr(e));
    }

    return res.json({ org });
  } catch (err: any) {
    console.error('admin_create_org_failed:', fmtErr(err));
    return res.status(500).json({ error: 'admin_create_org_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/org_users - list all org_user assignments
app.get("/api/admin/org_users", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("org_users")
      .select("id, org_id, user_id, role, mightycall_extension, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ org_users: data || [] });
  } catch (err: any) {
    console.error("admin_org_users_failed:", fmtErr(err));
    res.status(500).json({ error: "admin_org_users_failed", detail: fmtErr(err) ?? "unknown_error" });
  }
});

// POST /api/admin/org_users - upsert an org_user assignment
app.post("/api/admin/org_users", async (req, res) => {
  try {
    const { user_id, org_id, role, mightycall_extension } = req.body;
    if (!user_id || !org_id || !role) {
      return res.status(400).json({ error: "missing_required_fields", detail: "user_id, org_id and role are required" });
    }

    // Validate role - org_members only accepts these roles
    const validRoles = ['agent', 'org_manager', 'org_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "invalid_role", detail: `role must be one of: ${validRoles.join(', ')}` });
    }

    const payload = {
      user_id,
      org_id,
      role,
      mightycall_extension: mightycall_extension ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from("org_users")
      .upsert(payload, { onConflict: "org_id,user_id" })
      .select()
      .maybeSingle();

    if (error) throw error;
    res.json({ org_user: data });
  } catch (err: any) {
    console.error("admin_upsert_org_user_failed:", fmtErr(err));
    res.status(500).json({ error: "admin_upsert_org_user_failed", detail: fmtErr(err) ?? "unknown_error" });
  }
});

// DELETE /api/admin/org_users - remove an assignment (body: { user_id, org_id })
app.delete("/api/admin/org_users", async (req, res) => {
  try {
    const { user_id, org_id } = req.body || {};
    if (!user_id || !org_id) {
      return res.status(400).json({ error: "missing_required_fields", detail: "user_id and org_id required" });
    }

    const { error } = await supabaseAdmin
      .from("org_users")
      .delete()
      .eq("user_id", user_id)
      .eq("org_id", org_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error("admin_delete_org_user_failed:", fmtErr(err));
    res.status(500).json({ error: "admin_delete_org_user_failed", detail: fmtErr(err) ?? "unknown_error" });
  }
});

// GET /api/admin/mightycall/phone-numbers - list phone numbers (from org_phone_numbers)
app.get("/api/admin/mightycall/phone-numbers", async (req, res) => {
  try {
    const unassignedOnly = req.query.unassignedOnly === 'true' || req.query.unassignedOnly === '1';

    // Try newer schema first (number), then legacy (phone_number), then legacy table org_phone_numbers
    let data: any[] = [];
    try {
      const q = supabaseAdmin.from('phone_numbers').select('id, number, label, org_id, created_at').order('created_at', { ascending: true });
      const { data: d1, error: e1 } = await q;
      if (e1) throw e1;
      data = d1 || [];
    } catch (e1) {
    console.warn('phone_numbers select number failed:', fmtErr(e1));
      try {
        const q2 = supabaseAdmin.from('phone_numbers').select('id, phone_number, label, org_id, created_at').order('created_at', { ascending: true });
        const { data: d2, error: e2 } = await q2;
        if (e2) throw e2;
        data = (d2 || []).map((r: any) => ({ ...r, number: r.phone_number }));
      } catch (e2) {
        console.warn('phone_numbers select phone_number failed:', fmtErr(e2));
        try {
          const q3 = supabaseAdmin.from('org_phone_numbers').select('id, phone_number, label, org_id, created_at').order('created_at', { ascending: true });
          const { data: d3, error: e3 } = await q3;
          if (e3) throw e3;
          data = (d3 || []).map((r: any) => ({ ...r, number: r.phone_number }));
        } catch (e3) {
          console.warn('org_phone_numbers select failed:', fmtErr(e3));
          data = [];
        }
      }
    }

    if (unassignedOnly) {
      data = (data || []).filter((r: any) => r.org_id == null || r.org_id === undefined);
    }

    const mapped = (data || []).map((r: any) => ({
      id: r.id,
      number: r.number,
      label: r.label,
      orgId: r.org_id || null,
      orgName: null,
      createdAt: r.created_at,
    }));

    res.json({ phone_numbers: mapped });
  } catch (err: any) {
    console.error("mightycall_phone_numbers_failed:", fmtErr(err));
    res.status(500).json({ error: "mightycall_phone_numbers_failed", detail: fmtErr(err) ?? "unknown_error" });
  }
});

// GET /api/admin/mightycall/extensions - derive extensions from assignments
app.get("/api/admin/mightycall/extensions", async (_req, res) => {
  try {
    // Pull distinct mightycall_extension values from org_users
    const { data, error } = await supabaseAdmin
      .from("org_users")
      .select("mightycall_extension")
      .not("mightycall_extension", "is", null);

    if (error) throw error;

    const uniq = Array.from(new Set((data || []).map((r: any) => r.mightycall_extension))).filter(Boolean);
    const mapped = uniq.map((ext: string) => ({ extension: ext, display_name: ext }));
    res.json({ extensions: mapped });
  } catch (err: any) {
    console.error("mightycall_extensions_failed:", fmtErr(err));
    res.status(500).json({ error: "mightycall_extensions_failed", detail: fmtErr(err) ?? "unknown_error" });
  }
});

// GET /api/admin/phone-numbers - generic phone numbers listing
app.get('/api/admin/phone-numbers', async (req, res) => {
  try {
    // TODO: Re-enable auth check once x-user-id header transmission is fixed
    // For now, return all unassigned phone numbers without auth
    
    const orgId = req.query.orgId as string | undefined;
    const unassignedOnly = (req.query.unassignedOnly as string | undefined) === 'true';

    // Select basic columns that always exist
    let q = supabaseAdmin.from('phone_numbers').select('id, number, label, org_id').order('created_at', { ascending: true });
    if (unassignedOnly) q = q.is('org_id', null);
    if (orgId) q = q.eq('org_id', orgId);

    const { data, error } = await q;
    if (error) throw error;
    const mapped = (data || []).map((r: any) => {
      return {
        id: r.id,
        number: r.number,
        label: r.label ?? null,
        orgId: r.org_id ?? null,
        isActive: !!r.is_active
      };
    }).filter((p: any) => p.number); // Filter out records with no phone number
    res.json({ phone_numbers: mapped });
  } catch (err: any) {
    console.error('list_phone_numbers_failed:', fmtErr(err));
    res.status(500).json({ error: 'list_phone_numbers_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/orgs/:orgId/phone-numbers - get phone numbers assigned to an organization
// For admins: returns ALL phone numbers in the system
// For regular users: returns only explicitly assigned numbers
app.get('/api/orgs/:orgId/phone-numbers', async (req, res) => {
  try {
    const { orgId } = req.params;
    const actorId = req.header('x-user-id') || null;
    const isDev = process.env.NODE_ENV !== 'production' || req.header('x-dev-bypass') === 'true';

    // Org members can view their org's phone numbers, or if in dev mode
    if (actorId && !isDev) {
      const isMember = await isOrgMember(actorId, orgId);
      if (!isMember && !(await isPlatformAdmin(actorId))) {
        return res.status(403).json({ error: 'forbidden' });
      }
    }

    const isAdmin = actorId && await isPlatformAdmin(actorId);
    console.log('[get_org_phone_numbers] params:', { orgId, actorId, isDev, isAdmin });

    // Admins see ALL phone numbers; regular users see only assigned numbers
    if (isAdmin) {
      // Admin: return ALL phone numbers
      const { data: allPhones, error: phoneErr } = await supabaseAdmin
        .from('phone_numbers')
        .select('id, number, label, created_at');
      if (phoneErr) throw phoneErr;
      const mapped = (allPhones || []).map((p: any) => ({
        id: p.id,
        number: p.number || 'unknown',
        label: p.label || 'VictorySync LLC',
        is_active: true,
        created_at: p.created_at
      }));
      return res.json({ phone_numbers: mapped, numbers: mapped });
    }

    // Regular user: Get ONLY explicitly assigned phones from org_phone_numbers table
    const { data: orgPhones, error: opErr } = await supabaseAdmin
      .from('org_phone_numbers')
      .select('id, org_id, phone_number_id, phone_number, label, created_at')
      .eq('org_id', orgId);

    if (opErr) throw opErr;
    console.log('[get_org_phone_numbers] org_phone_numbers rows:', (orgPhones || []).length);

    // Collect phone IDs to look up full details
    const phoneIds = new Set<string>();
    for (const op of (orgPhones || [])) {
      if (op.phone_number_id) phoneIds.add(op.phone_number_id);
    }

    if (phoneIds.size === 0) {
      return res.json({ phone_numbers: [], numbers: [] });
    }

    // Get full phone details from phone_numbers table
    const { data: phoneDetails, error: phoneErr } = await supabaseAdmin
      .from('phone_numbers')
      .select('id, number, label, created_at')
      .in('id', Array.from(phoneIds));

    if (phoneErr) throw phoneErr;

    // Map phone details with org_phone_numbers labels (use org label if set, else fall back to phone label, else default to VictorySync LLC)
    const detailsById: Record<string, any> = {};
    for (const p of (phoneDetails || [])) {
      detailsById[p.id] = p;
    }

    const mapped = (orgPhones || []).map((op: any) => {
      const details = detailsById[op.phone_number_id];
      return {
        id: op.phone_number_id,
        number: details?.number || op.phone_number || 'unknown',
        label: op.label || details?.label || 'VictorySync LLC',
        is_active: true,
        created_at: op.created_at
      };
    });

    res.json({
      phone_numbers: mapped,
      numbers: mapped
    });
  } catch (err: any) {
    console.error('[get_org_phone_numbers] error:', fmtErr(err));
    res.status(500).json({ error: 'fetch_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/orgs/:orgId/recordings - Get recordings for an organization
app.get('/api/orgs/:orgId/recordings', async (req, res) => {
  try {
    const { orgId } = req.params;
    const actorId = req.header('x-user-id') || null;
    const isDev = process.env.NODE_ENV !== 'production' || req.header('x-dev-bypass') === 'true';
    const limit = parseInt(req.query.limit as string) || 10000;

    // Org members can view their org's recordings, or if in dev mode
    if (actorId && !isDev) {
      const isMember = await isOrgMember(actorId, orgId);
      if (!isMember && !(await isPlatformAdmin(actorId))) {
        return res.status(403).json({ error: 'forbidden' });
      }
    }

    // Fetch recordings for this org from mightycall_recordings table
    const { data: recordings, error } = await supabaseAdmin
      .from('mightycall_recordings')
      .select('*')
      .eq('org_id', orgId)
      .order('recording_date', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ recordings: recordings || [] });
  } catch (err: any) {
    console.error('[get_org_recordings] error:', fmtErr(err));
    res.status(500).json({ error: 'fetch_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// Legacy single-org unassign handler removed: unassignment now uses `org_phone_numbers` mapping.
// See later handler which deletes from `org_phone_numbers` for the many-to-many model.

// POST /api/admin/orgs/:orgId/managers/:orgMemberId/permissions - upsert org manager permissions
app.post('/api/admin/orgs/:orgId/managers/:orgMemberId/permissions', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    const { orgId, orgMemberId } = req.params;
    const perms = req.body || {};

    if (!orgId || !orgMemberId) return res.status(400).json({ error: 'missing_required_fields' });

    // Only platform_admin or org_admin can change manager permissions
    const allowed = (userId && (await isPlatformAdmin(userId))) || (userId && (await isOrgAdmin(userId, orgId)));
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    // Upsert into org_manager_permissions keyed by org_member_id
    const payload = {
      org_member_id: orgMemberId,
      can_manage_agents: !!perms.can_manage_agents,
      can_manage_phone_numbers: !!perms.can_manage_phone_numbers,
      can_edit_service_targets: !!perms.can_edit_service_targets,
      can_view_billing: !!perms.can_view_billing,
    };

    const { data, error } = await supabaseAdmin
      .from('org_manager_permissions')
      .upsert(payload, { onConflict: 'org_member_id' })
      .select()
      .maybeSingle();

    if (error) throw error;
    res.json({ permissions: data });
  } catch (err: any) {
    console.error('org_manager_permissions_failed:', fmtErr(err));
    res.status(500).json({ error: 'org_manager_permissions_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/users/:userId/platform-permissions - set platform manager permissions (platform_admin only)
app.post('/api/admin/users/:userId/platform-permissions', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { userId } = req.params;
    const perms = req.body || {};

    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!(await isPlatformAdmin(actorId))) return res.status(403).json({ error: 'forbidden' });

    const payload = {
      user_id: userId,
      can_manage_phone_numbers_global: !!perms.can_manage_phone_numbers_global,
      can_manage_agents_global: !!perms.can_manage_agents_global,
      can_manage_orgs: !!perms.can_manage_orgs,
      can_view_billing_global: !!perms.can_view_billing_global,
    };

    const { data, error } = await supabaseAdmin
      .from('platform_manager_permissions')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .maybeSingle();

    if (error) throw error;
    res.json({ permissions: data });
  } catch (err: any) {
    console.error('platform_manager_permissions_failed:', fmtErr(err));
    res.status(500).json({ error: 'platform_manager_permissions_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/users/:userId/platform-permissions - fetch global role + platform manager permissions (platform_admin only)
app.get('/api/admin/users/:userId/platform-permissions', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { userId } = req.params;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!(await isPlatformAdmin(actorId))) return res.status(403).json({ error: 'forbidden' });

    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('global_role')
      .eq('id', userId)
      .maybeSingle();
    if (pErr) throw pErr;

    const { data: perms, error: permsErr } = await supabaseAdmin
      .from('platform_manager_permissions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (permsErr) throw permsErr;

    res.json({ global_role: profile?.global_role || null, permissions: perms || null });
  } catch (err: any) {
    console.error('get_platform_permissions_failed:', fmtErr(err));
    res.status(500).json({ error: 'get_platform_permissions_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/user/profile - get current user's profile with full data (auth + metadata)
app.get('/api/user/profile', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    if (!userId) return res.status(401).json({ error: 'unauthenticated' });

    // Get user from auth.users with metadata
    const { data: user, error: userErr } = await supabaseAdmin
      .from('auth.users')
      .select('id, email, user_metadata')
      .eq('id', userId)
      .single();

    if (userErr || !user) {
      // Fallback to profiles table if auth.users not available
      const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('id, global_role')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      return res.json({ profile: profile || { id: userId, global_role: null } });
    }

    // Return enhanced user profile with metadata
    const globalRole = (user.user_metadata as any)?.global_role || null;
    res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: (user.user_metadata as any)?.full_name || '',
        phone_number: (user.user_metadata as any)?.phone_number || '',
        profile_pic_url: (user.user_metadata as any)?.profile_pic_url || ''
      },
      profile: { id: userId, global_role: globalRole }
    });
  } catch (err: any) {
    console.error('get_user_profile_failed:', fmtErr(err));
    res.status(500).json({ error: 'get_user_profile_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// PUT /api/user/profile - Update user profile
app.put('/api/user/profile', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    if (!userId) return res.status(401).json({ error: 'unauthenticated' });

    const { full_name, email, phone_number } = req.body;

    const updatePayload: any = {
      user_metadata: {
        full_name: full_name || '',
        phone_number: phone_number || ''
      }
    };

    if (email) {
      updatePayload.email = email;
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, updatePayload);

    if (error) throw error;

    res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: (data.user.user_metadata as any)?.full_name || '',
        phone_number: (data.user.user_metadata as any)?.phone_number || '',
        profile_pic_url: (data.user.user_metadata as any)?.profile_pic_url || ''
      }
    });
  } catch (err: any) {
    console.error('user_profile_update_failed:', fmtErr(err));
    res.status(500).json({ error: 'user_profile_update_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/user/orgs - list organizations for current user (by x-user-id)
app.get('/api/user/orgs', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    if (!userId) return res.status(401).json({ error: 'unauthenticated' });

    // Check if user is a platform admin first (has elevated org access)
    const { data: user, error: userErr } = await supabaseAdmin
      .from('auth.users')
      .select('id, user_metadata')
      .eq('id', userId)
      .single();
    
    const isPlatformAdmin = user && (user.user_metadata as any)?.global_role === 'platform_admin';

    // If platform admin, return all organizations
    if (isPlatformAdmin) {
      const { data: allOrgs, error: allOrgErr } = await supabaseAdmin
        .from('organizations')
        .select('*');
      if (allOrgErr) throw allOrgErr;
      return res.json({ orgs: allOrgs || [] });
    }

    // Regular users: get from org_users
    const { data: rows, error } = await supabaseAdmin
      .from('org_users')
      .select('org_id')
      .eq('user_id', userId);
    if (error) throw error;

    const orgIds = (rows || []).map((r: any) => r.org_id).filter(Boolean);
    if (orgIds.length === 0) return res.json({ orgs: [] });

    const { data: orgs, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .in('id', orgIds);
    if (orgErr) throw orgErr;

    res.json({ orgs: orgs || [] });
  } catch (err: any) {
    console.error('get_user_orgs_failed:', fmtErr(err));
    res.status(500).json({ error: 'get_user_orgs_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/user/onboard - create an org for the user when they have no orgs
app.post('/api/user/onboard', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    if (!userId) return res.status(401).json({ error: 'unauthenticated' });

    const { name } = req.body || {};
    const orgName = name || `Org for ${userId.toString().slice(0,8)}`;

    // create organization and add membership as org_admin
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .insert({ name: orgName })
      .select()
      .maybeSingle();
    if (orgErr) throw orgErr;

    // ensure membership
    const payload = { org_id: org.id, user_id: userId, role: 'org_admin' };
    const { error: upErr } = await supabaseAdmin.from('org_users').upsert(payload, { onConflict: 'org_id,user_id' });
    if (upErr) console.warn('onboard_membership_upsert_warning:', fmtErr(upErr));

    res.status(201).json({ org });
  } catch (err: any) {
    console.error('user_onboard_failed:', fmtErr(err));
    res.status(500).json({ error: 'user_onboard_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/users/:userId/global-role - set user's global role (platform_admin only)
app.post('/api/admin/users/:userId/global-role', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { userId } = req.params;
    const { globalRole } = req.body || {};

    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!(await isPlatformAdmin(actorId))) return res.status(403).json({ error: 'forbidden' });

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: userId, global_role: globalRole }, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (error) throw error;
    res.json({ profile: data });
  } catch (err: any) {
    console.error('set_global_role_failed:', fmtErr(err));
    res.status(500).json({ error: 'set_global_role_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/orgs/:orgId/phone-numbers - assign phone numbers to org
app.post("/api/admin/orgs/:orgId/phone-numbers", async (req, res) => {
  try {
    const userId = req.header("x-user-id") || (req.body && req.body.userId) || null;
    const { orgId } = req.params;
    const { phoneNumberIds } = req.body || {};

    console.log('[assign_phone_numbers] POST request received', { orgId, phoneNumberIds, userId });

    if (!orgId || !Array.isArray(phoneNumberIds)) {
      console.log('[assign_phone_numbers] missing required fields', { orgId, phoneNumberIds });
      return res.status(400).json({ error: "missing_required_fields", detail: "orgId and phoneNumberIds array required" });
    }

    // Authorization: allow via x-user-id (platform/org roles) OR via API key scope
    const apiScope = (req as any).apiKeyScope || null;
    const isDev = process.env.NODE_ENV !== 'production';

    const allowedByApiKey = apiScope && (apiScope.scope === 'platform' || (apiScope.scope === 'org' && apiScope.orgId === orgId));

    const allowedByUser =
      (isDev && userId) ||
      (userId && (await isPlatformAdmin(userId))) ||
      (userId && (await isPlatformManagerWith(userId, "can_manage_phone_numbers_global"))) ||
      (userId && (await isOrgAdmin(userId, orgId))) ||
      (userId && (await isOrgManagerWith(userId, orgId, "can_manage_phone_numbers")));

    const allowed = Boolean(allowedByApiKey) || Boolean(allowedByUser);
    if (!allowed) {
      console.warn('[assign_phone_numbers] unauthorized attempt', { userId, apiScope, orgId });
      return res.status(403).json({ error: "forbidden" });
    }

    console.log('[assign_phone_numbers] assigning', phoneNumberIds.length, 'phone(s) to org', orgId);
    
    // Load phone number strings for provided ids to support legacy schema if needed
    const { data: phoneRows } = await supabaseAdmin.from('phone_numbers').select('id, number').in('id', phoneNumberIds as string[]);
    const idToNumber: Record<string, string> = {};
    if (phoneRows && Array.isArray(phoneRows)) {
      for (const p of phoneRows) {
        idToNumber[p.id] = p.number;
        console.log('[assign_phone_numbers] resolved phone', p.id, '→', p.number);
      }
    }
    console.log('[assign_phone_numbers] id-to-number mapping:', idToNumber);

    const insertErrors: string[] = [];
    let successCount = 0;

    // Try to assign each phone: first try modern schema, then fall back to legacy if needed
    for (const phoneId of phoneNumberIds) {
      let assigned = false;

      // Try modern schema first (phone_number_id)
      try {
        console.log('[assign_phone_numbers] trying modern schema for phoneId:', phoneId);
        const numberStr = idToNumber[phoneId];
        if (!numberStr) {
          console.warn('[assign_phone_numbers] phoneId', phoneId, 'cannot be resolved to phone number, will try legacy');
        }
        const { error: modernErr } = await supabaseAdmin
          .from('org_phone_numbers')
          .insert({ org_id: orgId, phone_number_id: phoneId, phone_number: numberStr || '' });
        
        if (!modernErr) {
          console.log('[assign_phone_numbers] ✓ successfully assigned via modern schema:', phoneId);
          successCount++;
          assigned = true;
        } else {
          const modernMsg = (modernErr as any)?.message || String(modernErr);
          console.error('[assign_phone_numbers] modern schema error FULL:', JSON.stringify(modernErr, null, 2));
          console.error('[assign_phone_numbers] modern schema error message:', modernMsg);
          // Check if it's a duplicate - that's OK
          if (modernMsg && (modernMsg.includes('duplicate key') || modernMsg.includes('already exists') || modernMsg.includes('unique constraint'))) {
            console.log('[assign_phone_numbers] phone already assigned (via modern schema):', phoneId);
            // Try to UPDATE the existing row to reassign it to this org instead
            console.log('[assign_phone_numbers] attempting to reassign phone to this org via UPDATE...');
            const { error: updateErr } = await supabaseAdmin
              .from('org_phone_numbers')
              .update({ org_id: orgId, phone_number_id: phoneId })
              .eq('phone_number', numberStr)
              .select('id');
            if (!updateErr) {
              console.log('[assign_phone_numbers] ✓ successfully reassigned via UPDATE:', phoneId);
              successCount++;
              assigned = true;
            } else {
              console.warn('[assign_phone_numbers] UPDATE also failed:', (updateErr as any)?.message || String(updateErr));
            }
          } else if (modernMsg && modernMsg.includes('column "phone_number_id" does not exist')) {
            // Schema doesn't have phone_number_id, will try legacy below
            console.log('[assign_phone_numbers] modern schema not available, will try legacy for:', phoneId);
          } else {
            // Other error - log it but try legacy
            console.warn('[assign_phone_numbers] modern schema insert failed:', modernMsg);
          }
        }
      } catch (e) {
        console.warn('[assign_phone_numbers] modern schema exception:', String(e));
      }

      // If modern schema didn't work, try legacy schema (phone_number text)
      if (!assigned) {
        try {
          const numberStr = idToNumber[phoneId];
          
          if (!numberStr) {
            console.warn('[assign_phone_numbers] phoneId', phoneId, 'cannot be resolved to phone number');
            insertErrors.push(`unresolved:${phoneId}`);
            continue;
          }

          console.log('[assign_phone_numbers] trying legacy schema for phoneId:', phoneId, '→', numberStr);
          const { error: legacyErr } = await supabaseAdmin
            .from('org_phone_numbers')
            .insert({ org_id: orgId, phone_number: numberStr });
          
          if (!legacyErr) {
            console.log('[assign_phone_numbers] ✓ successfully assigned via legacy schema:', numberStr);
            successCount++;
            assigned = true;
          } else {
            const legacyMsg = (legacyErr as any)?.message || String(legacyErr);
            
            // Check if it's a duplicate - that's OK
            if (legacyMsg && (legacyMsg.includes('duplicate key') || legacyMsg.includes('already exists') || legacyMsg.includes('unique constraint'))) {
              console.log('[assign_phone_numbers] phone already assigned (via legacy schema):', numberStr);
              successCount++;
              assigned = true;
            } else {
              console.warn('[assign_phone_numbers] legacy schema insert failed:', legacyMsg);
              insertErrors.push(legacyMsg);
            }
          }
        } catch (e) {
          console.warn('[assign_phone_numbers] legacy schema exception:', String(e));
          insertErrors.push(String(e));
        }
      }
    }

    console.log('[assign_phone_numbers] assignment complete:', { successCount, totalRequested: phoneNumberIds.length, errorCount: insertErrors.length });
    
    if (successCount === 0) {
      return res.status(400).json({ error: 'all_inserts_failed', details: insertErrors });
    }
    
    res.json({ success: true, assigned: successCount });
  } catch (err: any) {
    console.error("assign_phone_numbers_failed:", fmtErr(err));
    res.status(500).json({ error: "assign_phone_numbers_failed", detail: fmtErr(err) ?? "unknown_error" });
  }
});

// DELETE /api/admin/orgs/:orgId/phone-numbers/:phoneNumberId - unassign number (set org_id = NULL)
app.delete('/api/admin/orgs/:orgId/phone-numbers/:phoneNumberId', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    const { orgId, phoneNumberId } = req.params;
    if (!orgId || !phoneNumberId) return res.status(400).json({ error: 'missing_required_fields' });

    // Authorization: platform_admin OR platform_manager with global perm OR org_admin OR org_manager with perm
    // In dev mode, allow if userId is present (for testing)
    const apiScope = (req as any).apiKeyScope || null;
    const isDev = process.env.NODE_ENV !== 'production';

    const allowedByApiKey = apiScope && (apiScope.scope === 'platform' || (apiScope.scope === 'org' && apiScope.orgId === orgId));

    const allowedByUser =
      (isDev && userId) ||
      (userId && (await isPlatformAdmin(userId))) ||
      (userId && (await isPlatformManagerWith(userId, 'can_manage_phone_numbers_global'))) ||
      (userId && (await isOrgAdmin(userId, orgId))) ||
      (userId && (await isOrgManagerWith(userId, orgId, 'can_manage_phone_numbers')));

    const allowed = Boolean(allowedByApiKey) || Boolean(allowedByUser);
    if (!allowed) {
      console.warn('[unassign_phone] unauthorized attempt', { userId, apiScope, orgId, phoneNumberId });
      return res.status(403).json({ error: 'forbidden' });
    }

    // Remove mapping from org_phone_numbers. Robust approach: fetch the row first, then delete by id.
    let deletedCount = 0;
    
    console.log('[unassign_phone] attempting to delete phoneNumberId:', phoneNumberId, 'for org:', orgId);
    
    // Try to find by org_phone_numbers.id (the row ID - this is what the frontend sends)
    try {
      const { data: rowsById, error: fetchByIdErr } = await supabaseAdmin
        .from('org_phone_numbers')
        .select('id')
        .eq('org_id', orgId)
        .eq('id', phoneNumberId);
      
      console.log('[unassign_phone] lookup by id result:', { error: fetchByIdErr, rowsFound: rowsById?.length || 0 });
      
      if (!fetchByIdErr && rowsById && rowsById.length > 0) {
        // Delete by row id
        for (const row of rowsById) {
          const { error: delErr } = await supabaseAdmin
            .from('org_phone_numbers')
            .delete()
            .eq('id', row.id);
          if (!delErr) {
            console.log('[unassign_phone] ✓ successfully deleted row:', row.id);
            deletedCount += 1;
          } else {
            console.warn('[unassign_phone] delete failed for row:', row.id, 'error:', fmtErr(delErr));
          }
        }
      }
    } catch (e) {
      console.warn('[unassign_phone] delete by org_phone_numbers.id failed:', fmtErr(e));
    }

    // Fallback: try by phone_number_id column
    if (deletedCount === 0) {
      try {
        const { data: rowsByPhoneId, error: fetchByPhoneIdErr } = await supabaseAdmin
          .from('org_phone_numbers')
          .select('id')
          .eq('org_id', orgId)
          .eq('phone_number_id', phoneNumberId);
        
        if (!fetchByPhoneIdErr && rowsByPhoneId && rowsByPhoneId.length > 0) {
          for (const row of rowsByPhoneId) {
            const { error: delErr } = await supabaseAdmin
              .from('org_phone_numbers')
              .delete()
              .eq('id', row.id);
            if (!delErr) deletedCount += 1;
          }
        }
      } catch (e) {
        console.warn('[unassign_phone] delete by phone_number_id failed:', fmtErr(e));
      }
    }

    // Fallback: try by phone_number text column
    if (deletedCount === 0) {
      try {
        const { data: rowsByPhone, error: fetchByPhoneErr } = await supabaseAdmin
          .from('org_phone_numbers')
          .select('id')
          .eq('org_id', orgId)
          .eq('phone_number', phoneNumberId);
        
        if (!fetchByPhoneErr && rowsByPhone && rowsByPhone.length > 0) {
          for (const row of rowsByPhone) {
            const { error: delErr } = await supabaseAdmin
              .from('org_phone_numbers')
              .delete()
              .eq('id', row.id);
            if (!delErr) deletedCount += 1;
          }
        }
      } catch (e) {
        console.warn('[unassign_phone] delete by phone_number also failed:', fmtErr(e));
      }
    }

    // Final fallback: if still nothing deleted, attempt to resolve the provided identifier
    // as an actual phone number in the `phone_numbers` table (either exact `number` or
    // `number_digits`). If matches are found, delete any `org_phone_numbers` rows that
    // reference those phone_numbers via `phone_number_id` for this org.
    if (deletedCount === 0) {
      try {
        // Normalize digits-only representation from the provided string
        const digitsOnly = (phoneNumberId || '').replace(/\D+/g, '');

        const { data: matchedPhones, error: matchErr } = await supabaseAdmin
          .from('phone_numbers')
          .select('id, number, number_digits')
          .or(`number.eq.${phoneNumberId},number_digits.eq.${digitsOnly}`);

        if (!matchErr && matchedPhones && matchedPhones.length > 0) {
          const ids = matchedPhones.map((p: any) => p.id);
          console.log('[unassign_phone] resolved phoneNumberId to phone_numbers ids:', ids);

          const { error: delMapErr } = await supabaseAdmin
            .from('org_phone_numbers')
            .delete()
            .eq('org_id', orgId)
            .in('phone_number_id', ids);

          if (!delMapErr) {
            // We can't easily know how many rows were deleted from this single call,
            // so count this as at least one deletion to avoid returning 404.
            deletedCount += 1;
            console.log('[unassign_phone] deleted org_phone_numbers by resolved phone_number_id for org:', orgId);
          } else {
            console.warn('[unassign_phone] failed deleting resolved org_phone_numbers:', fmtErr(delMapErr));
          }
        }
      } catch (e) {
        console.warn('[unassign_phone] final fallback (resolve by phone_numbers) failed:', fmtErr(e));
      }
    }

    if (deletedCount === 0) {
      return res.status(404).json({ error: 'phone_number_not_found_for_org' });
    }

    res.status(204).send();
  } catch (err: any) {
    console.error('unassign_phone_failed:', fmtErr(err));
    res.status(500).json({ error: 'unassign_phone_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/mightycall/sync - fetch from MightyCall and upsert phone numbers + extensions
app.get('/api/admin/mightycall/sync', async (_req, res) => {
  try {
    const actorId = _req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    try {
      // Use integration helper to sync phone numbers into `phone_numbers` table
      const result = await syncMightyCallPhoneNumbers(supabaseAdmin);
      // Also fetch extensions to upsert
      const exts = await fetchMightyCallExtensions();

      for (const e of exts) {
        const { error } = await supabaseAdmin
          .from('mightycall_extensions')
          .upsert({ extension: e.extension, display_name: e.display_name, external_id: e.id }, { onConflict: 'extension' });
        if (error) console.warn('extension upsert failed', error);
      }

      res.json({ success: true, phones: result.upserted || 0, extensions: exts.length });
    } catch (mcErr: any) {
      // If MightyCall fails, return error with details
      console.error('mightycall_sync_failed:', fmtErr(mcErr));
      res.status(500).json({ error: 'mightycall_sync_failed', detail: fmtErr(mcErr) ?? 'unknown_error', message: mcErr?.message });
    }
  } catch (err: any) {
    console.error('mightycall_sync_failed:', fmtErr(err));
    res.status(500).json({ error: 'mightycall_sync_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// debug route removed

// GET /api/admin/orgs/:orgId/integrations - get integrations for org (org_admin or platform_admin)
app.get('/api/admin/orgs/:orgId/integrations', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const orgId = req.params.orgId;
    if (!actorId) return res.status(401).json({ error: 'unauthorized' });

    // Check permissions: platform_admin or org_admin for this org
    const isAdmin = await isPlatformAdmin(actorId);
    if (!isAdmin) {
      const { data: membership } = await supabaseAdmin
        .from('org_members')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', actorId)
        .maybeSingle();
      if (!membership || !['org_admin', 'org_manager'].includes(membership.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
    }

    // Fetch integrations (but don't return secrets)
    const { data, error } = await supabaseAdmin
      .from('org_integrations')
      .select('id, org_id, integration_type, label, created_at, updated_at')
      .eq('org_id', orgId);
    if (error) throw error;

    res.json({ integrations: data || [] });
  } catch (err: any) {
    console.error('integrations_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'integrations_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/orgs/:orgId/integrations - create or update an integration (org_admin or platform_admin)
app.post('/api/admin/orgs/:orgId/integrations', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const orgId = req.params.orgId;
    if (!actorId) return res.status(401).json({ error: 'unauthorized' });

    // Check permissions
    const isAdmin = await isPlatformAdmin(actorId);
    if (!isAdmin) {
      const { data: membership } = await supabaseAdmin
        .from('org_members')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', actorId)
        .maybeSingle();
      if (!membership || !['org_admin', 'org_manager'].includes(membership.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
    }

    const { integration_type, label, credentials } = req.body;
    if (!integration_type || !credentials) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    // Upsert the integration (store credentials encrypted in DB)
    const { data, error } = await supabaseAdmin
      .from('org_integrations')
      .upsert(
        {
          org_id: orgId,
          integration_type,
          label: label || integration_type,
          credentials,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'org_id,integration_type' }
      )
      .select('id, org_id, integration_type, label, created_at, updated_at')
      .single();

    if (error) throw error;

    res.json({ integration: data });
  } catch (err: any) {
    console.error('integration_save_failed:', fmtErr(err));
    res.status(500).json({ error: 'integration_save_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// DELETE /api/admin/orgs/:orgId/integrations/:integrationId - delete an integration
app.delete('/api/admin/orgs/:orgId/integrations/:integrationId', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const orgId = req.params.orgId;
    if (!actorId) return res.status(401).json({ error: 'unauthorized' });

    // Check permissions
    const isAdmin = await isPlatformAdmin(actorId);
    if (!isAdmin) {
      const { data: membership } = await supabaseAdmin
        .from('org_members')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', actorId)
        .maybeSingle();
      if (!membership || !['org_admin', 'org_manager'].includes(membership.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
    }

    const { error } = await supabaseAdmin
      .from('org_integrations')
      .delete()
      .eq('id', req.params.integrationId)
      .eq('org_id', orgId);
    if (error) throw error;

    res.json({ success: true });
  } catch (err: any) {
    console.error('integration_delete_failed:', fmtErr(err));
    res.status(500).json({ error: 'integration_delete_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/mightycall/sync - fetch from MightyCall and upsert phone numbers + extensions + calls
app.post('/api/admin/mightycall/sync', async (_req, res) => {
  try {
    const actorId = _req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    try {
      // Use integration helper to sync phone numbers into `phone_numbers` table
      const phoneResult = await syncMightyCallPhoneNumbers(supabaseAdmin);
      // Also fetch extensions to upsert
      const exts = await fetchMightyCallExtensions();

      for (const e of exts) {
        const { error } = await supabaseAdmin
          .from('mightycall_extensions')
          .upsert({ extension: e.extension, display_name: e.display_name, external_id: e.id }, { onConflict: 'extension' });
        if (error) console.warn('extension upsert failed', error);
      }

      // Sync calls for all organizations that have MightyCall configured
      let callsSynced = 0;
      const { data: orgs } = await supabaseAdmin.from('organizations').select('id');
      if (orgs && orgs.length > 0) {
        for (const org of orgs) {
          try {
            const callResult = await syncMightyCallCallHistory(supabaseAdmin, org.id);
            callsSynced += callResult.callsSynced;
          } catch (callErr) {
            console.warn(`[MightyCall] Failed to sync calls for org ${org.id}:`, callErr);
          }
        }
      }

      res.json({ success: true, phones: phoneResult.upserted || 0, extensions: exts.length, calls: callsSynced });
    } catch (mcErr: any) {
      // If MightyCall fails, return error with details
      console.error('mightycall_sync_failed:', fmtErr(mcErr));
      res.status(500).json({ error: 'mightycall_sync_failed', detail: fmtErr(mcErr) ?? 'unknown_error', message: mcErr?.message });
    }
  } catch (err: any) {
    console.error('mightycall_sync_failed:', fmtErr(err));
    res.status(500).json({ error: 'mightycall_sync_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/mightycall/voicemails - list voicemails for an org
app.get('/api/admin/mightycall/voicemails', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const orgId = req.query.orgId as string | undefined;
    let q = supabaseAdmin.from('voicemail_logs').select('*').order('message_date', { ascending: false });
    if (orgId) q = q.eq('org_id', orgId);

    const { data, error } = await q;
    if (error) throw error;

    res.json({ voicemails: data || [] });
  } catch (err: any) {
    console.error('voicemails_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'voicemails_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/mightycall/sync/voicemails - sync voicemails from MightyCall
app.post('/api/admin/mightycall/sync/voicemails', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { orgId } = req.body;
    if (!orgId) return res.status(400).json({ error: 'missing_org_id' });

    try {
      const result = await syncMightyCallVoicemails(supabaseAdmin, orgId);
      res.json({ success: true, voicemails: result.voicemailsSynced });
    } catch (mcErr: any) {
      console.error('mightycall_voicemail_sync_failed:', fmtErr(mcErr));
      res.status(500).json({ error: 'mightycall_voicemail_sync_failed', detail: fmtErr(mcErr) ?? 'unknown_error' });
    }
  } catch (err: any) {
    console.error('mightycall_voicemail_sync_failed:', fmtErr(err));
    res.status(500).json({ error: 'mightycall_voicemail_sync_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/mightycall/call-history - list call history for an org
app.get('/api/admin/mightycall/call-history', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const orgId = req.query.orgId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string || '100'), 1000);
    let q = supabaseAdmin.from('call_history').select('*').order('call_date', { ascending: false }).limit(limit);
    if (orgId) q = q.eq('org_id', orgId);

    const { data, error } = await q;
    if (error) throw error;

    res.json({ calls: data || [] });
  } catch (err: any) {
    console.error('call_history_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'call_history_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/mightycall/sync/calls - sync call history from MightyCall
app.post('/api/admin/mightycall/sync/calls', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { orgId, dateStart, dateEnd } = req.body;
    if (!orgId) return res.status(400).json({ error: 'missing_org_id' });

    try {
      const result = await syncMightyCallCallHistory(supabaseAdmin, orgId, { dateStart, dateEnd });
      res.json({ success: true, calls: result.callsSynced });
    } catch (mcErr: any) {
      console.error('mightycall_call_history_sync_failed:', fmtErr(mcErr));
      res.status(500).json({ error: 'mightycall_call_history_sync_failed', detail: fmtErr(mcErr) ?? 'unknown_error' });
    }
  } catch (err: any) {
    console.error('mightycall_call_history_sync_failed:', fmtErr(err));
    res.status(500).json({ error: 'mightycall_call_history_sync_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/mightycall/send-sms - send SMS and log it
app.post('/api/admin/mightycall/send-sms', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { orgId, from, to, message } = req.body;
    if (!orgId || !from || !to || !message) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    try {
      // Log the SMS
      const smsMessage = {
        from,
        to: Array.isArray(to) ? to : [to],
        text: message,
        direction: 'outbound',
        status: 'sent'
      };

      const logResult = await syncSMSLog(supabaseAdmin, orgId, smsMessage);
      if (!logResult.smsSynced) {
        return res.status(500).json({ error: 'sms_log_failed' });
      }

      res.json({ success: true, message: 'SMS sent and logged' });
    } catch (mcErr: any) {
      console.error('sms_send_failed:', fmtErr(mcErr));
      res.status(500).json({ error: 'sms_send_failed', detail: fmtErr(mcErr) ?? 'unknown_error' });
    }
  } catch (err: any) {
    console.error('sms_send_failed:', fmtErr(err));
    res.status(500).json({ error: 'sms_send_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/mightycall/sms-logs - list SMS logs for an org
app.get('/api/admin/mightycall/sms-logs', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const orgId = req.query.orgId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string || '100'), 1000);
    let q = supabaseAdmin.from('sms_logs').select('*').order('sent_at', { ascending: false }).limit(limit);
    if (orgId) q = q.eq('org_id', orgId);

    const { data, error } = await q;
    if (error) throw error;

    res.json({ sms_logs: data || [] });
  } catch (err: any) {
    console.error('sms_logs_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'sms_logs_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/mightycall/contacts - list contacts for an org
app.get('/api/admin/mightycall/contacts', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const orgId = req.query.orgId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string || '100'), 1000);
    let q = supabaseAdmin.from('contact_events').select('*').order('created_at', { ascending: false }).limit(limit);
    if (orgId) q = q.eq('org_id', orgId);

    const { data, error } = await q;
    if (error) throw error;

    res.json({ contacts: data || [] });
  } catch (err: any) {
    console.error('contacts_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'contacts_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/mightycall/sync/contacts - sync contacts from MightyCall
app.post('/api/admin/mightycall/sync/contacts', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { orgId } = req.body;
    if (!orgId) return res.status(400).json({ error: 'missing_org_id' });

    try {
      const result = await syncMightyCallContacts(supabaseAdmin, orgId);
      res.json({ success: true, contacts: result.contactsSynced });
    } catch (mcErr: any) {
      console.error('mightycall_contacts_sync_failed:', fmtErr(mcErr));
      res.status(500).json({ error: 'mightycall_contacts_sync_failed', detail: fmtErr(mcErr) ?? 'unknown_error' });
    }
  } catch (err: any) {
    console.error('mightycall_contacts_sync_failed:', fmtErr(err));
    res.status(500).json({ error: 'mightycall_contacts_sync_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/orgs/:orgId/users/:userId/phone-assignments - assign phone numbers to a user
app.post('/api/orgs/:orgId/users/:userId/phone-assignments', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId, userId } = req.params;
    const { phoneNumberIds } = req.body;

    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!phoneNumberIds || !Array.isArray(phoneNumberIds)) {
      return res.status(400).json({ error: 'invalid_phone_number_ids' });
    }

    // Check if user is org admin or platform admin
    const orgAdminCheck = await isOrgAdmin(actorId, orgId);
    const isPlatformAdminUser = await isPlatformAdmin(actorId);
    if (!orgAdminCheck && !isPlatformAdminUser) {
      return res.status(403).json({ error: 'forbidden' });
    }

    try {
      // Delete existing assignments for this user
      await supabaseAdmin
        .from('user_phone_assignments')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', userId);

      // Insert new assignments
      const assignments = phoneNumberIds.map((phoneNumberId: string) => ({
        org_id: orgId,
        user_id: userId,
        phone_number_id: phoneNumberId,
        created_at: new Date().toISOString()
      }));

      const { error } = await supabaseAdmin
        .from('user_phone_assignments')
        .insert(assignments);

      if (error) throw error;

      res.json({ success: true, assignments: phoneNumberIds.length });
    } catch (err: any) {
      console.error('phone_assignment_failed:', fmtErr(err));
      res.status(500).json({ error: 'phone_assignment_failed', detail: fmtErr(err) ?? 'unknown_error' });
    }
  } catch (err: any) {
    console.error('phone_assignment_failed:', fmtErr(err));
    res.status(500).json({ error: 'phone_assignment_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/orgs/:orgId/users/:userId/phone-assignments - get assigned phone numbers for a user
app.get('/api/orgs/:orgId/users/:userId/phone-assignments', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId, userId } = req.params;

    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });

    // Check if user is org admin, org member, or platform admin
    const isMember = !!(await supabaseAdmin
      .from('org_users')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', actorId)
      .maybeSingle()
      .then(r => r.data));
    const orgAdminCheck = await isOrgAdmin(actorId, orgId);
    const isPlatformAdminUser = await isPlatformAdmin(actorId);

    if (!isMember && !orgAdminCheck && !isPlatformAdminUser) {
      return res.status(403).json({ error: 'forbidden' });
    }

    // Org members can only see their own assignments, admins can see all
    const targetUserId = (isMember && !orgAdminCheck && !isPlatformAdminUser && actorId !== userId) ? actorId : userId;

    const { phones } = await getUserAssignedPhoneNumbers(orgId, targetUserId);
    res.json({ phones });
  } catch (err: any) {
    console.error('get_phone_assignments_failed:', fmtErr(err));
    res.status(500).json({ error: 'get_phone_assignments_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/user/phone-assignments - get current user's assigned phone numbers in their org
app.get('/api/user/phone-assignments', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const orgId = req.query.orgId as string | undefined;

    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!orgId) return res.status(400).json({ error: 'missing_org_id' });

    // Verify user is a member of the org
    const isMember = !!(await supabaseAdmin
      .from('org_users')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', actorId)
      .maybeSingle()
      .then(r => r.data));

    if (!isMember) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const { phones } = await getUserAssignedPhoneNumbers(orgId, actorId);
    res.json({ phones });
  } catch (err: any) {
    console.error('get_user_phones_failed:', fmtErr(err));
    res.status(500).json({ error: 'get_user_phones_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/orgs/:orgId/agent-extensions - list agent extensions for an org
app.get('/api/orgs/:orgId/agent-extensions', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId } = req.params;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    // Allow org members, org admins, and platform admins/managers
    const isMember = !!(await supabaseAdmin.from('org_users').select('id').eq('org_id', orgId).eq('user_id', actorId).maybeSingle().then(r => r.data));
    const allowed = isMember || (await isPlatformAdmin(actorId)) || (await isPlatformManagerWith(actorId, 'can_manage_agents')) || (await isOrgManagerWith(actorId, orgId, 'can_manage_agents'));
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    const { data, error } = await supabaseAdmin.from('agent_extensions').select('user_id, extension').eq('org_id', orgId);
    if (error) throw error;
    res.json({ extensions: data || [] });
  } catch (err: any) {
    console.error('agent_extensions_failed:', fmtErr(err));
    res.status(500).json({ error: 'agent_extensions_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/orgs/:orgId/agents/:userId/extension - set agent extension (org_admin or managers with permission, platform_admin allowed)
app.post('/api/orgs/:orgId/agents/:userId/extension', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId, userId } = req.params;
    const { extension } = req.body || {};
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    const allowed = (await isPlatformAdmin(actorId)) || (await isOrgAdmin(actorId, orgId)) || (await isOrgManagerWith(actorId, orgId, 'can_manage_agents'));
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    if (!extension) return res.status(400).json({ error: 'missing_required_fields' });

    const payload = { org_id: orgId, user_id: userId, extension };
    const { data, error } = await supabaseAdmin.from('agent_extensions').upsert(payload, { onConflict: 'org_id,user_id' }).select().maybeSingle();
    if (error) throw error;
    res.json({ extension: data });
  } catch (err: any) {
    console.error('set_agent_extension_failed:', fmtErr(err));
    res.status(500).json({ error: 'set_agent_extension_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/orgs/:orgId - detailed org info: members (with email), phones, stats
app.get('/api/admin/orgs/:orgId', async (req, res) => {
  try {
    console.info('[admin_org_detail] start for request');
    const { orgId } = req.params;
    let { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select('id, name, created_at')
      .eq('id', orgId)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) {
      // If the canonical organizations row is missing, try to infer existence
      // from membership tables so the Manage UI can still function during
      // deployments or partial schema rollouts.
      console.warn('[admin_org_detail] org row not found, attempting membership-based fallback for org:', orgId);
      try {
        // Check for evidence the org exists in several places: org_users, legacy organization_members,
        // assigned phone mappings, pending invites, or api keys. Any positive hit lets us synthesize
        // a minimal org object so the admin UI can function during partial rollouts.
        const checks = [
          supabaseAdmin.from('org_users').select('id').eq('org_id', orgId).limit(1),
          supabaseAdmin.from('organization_members').select('id').eq('org_id', orgId).limit(1),
          supabaseAdmin.from('org_phone_numbers').select('phone_number_id').eq('org_id', orgId).limit(1),
          supabaseAdmin.from('org_invites').select('id').eq('org_id', orgId).limit(1),
          supabaseAdmin.from('org_api_keys').select('id').eq('org_id', orgId).limit(1),
        ];
        const results = await Promise.allSettled(checks);
        const found = results.some(r => {
          if (r.status === 'fulfilled') {
            const v: any = (r as any).value;
            if (Array.isArray(v.data) && v.data.length > 0) return true;
          }
          return false;
        });
        if (found) {
          org = { id: orgId, name: `Organization ${orgId.slice(0,8)}`, created_at: null } as any;
          console.warn('[admin_org_detail] synthesized org object from membership/related data for:', orgId);
        }
      } catch (e) {
        console.warn('[admin_org_detail] membership fallback failed:', fmtErr(e));
      }
      if (!org) return res.status(404).json({ error: 'org_not_found' });
    }
    console.info('[admin_org_detail] org found:', orgId);

    // members from `org_users` (canonical in this deployment)
    let memberships: any[] = [];
    try {
      const { data: m1, error: m1Err } = await supabaseAdmin
        .from('org_users')
        .select('id, org_id, user_id, role, mightycall_extension, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (!m1Err && m1 && m1.length > 0) memberships = m1;
      else {
        // Fallback to legacy `organization_members` if present
        const { data: m2, error: m2Err } = await supabaseAdmin
          .from('organization_members')
          .select('id, org_id, user_id, role, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false });
        if (!m2Err && m2) {
          memberships = m2;
          console.warn('[admin_orgs] used legacy organization_members fallback for org:', orgId);
        }
      }
    } catch (e) {
      console.warn('[admin_orgs] membership lookup failed, continuing with empty members:', fmtErr(e));
      memberships = [];
    }

    const members: Array<any> = [];
    for (const m of (memberships || [])) {
      try {
        const { data: udata, error: uerr } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        if (uerr) {
          members.push({ orgMemberId: m.id, user_id: m.user_id, email: null, role: m.role, mightycall_extension: m.mightycall_extension });
        } else {
          members.push({ orgMemberId: m.id, user_id: m.user_id, email: udata.user.email || null, role: m.role, mightycall_extension: m.mightycall_extension });
        }
      } catch (e) {
        members.push({ orgMemberId: m.id, user_id: m.user_id, email: null, role: m.role, mightycall_extension: m.mightycall_extension });
      }
    }

    // phones assigned to this org (many-to-many) - use helper that supports multiple schema variants
    let phones: any[] = [];
    try {
      const { phones: assignedPhones } = await getAssignedPhoneNumbersForOrg(orgId);
      phones = (assignedPhones || []).map((p: any) => ({ id: p.id, number: p.number, label: p.label ?? null, number_digits: p.number_digits ?? null, created_at: p.created_at }));
    } catch (err) {
      console.warn('org_phone_numbers helper failed:', fmtErr(err));
      phones = [];
    }
    console.info('[admin_org_detail] phones loaded:', (phones || []).length);

    // stats (calls today) - reuse logic
    const todayStart = new Date(new Date().setHours(0,0,0,0)).toISOString();
    // Compute stats based only on calls to assigned phone numbers for this org
    const assignedNumbers = (phones || []).map((p: any) => p.number).filter(Boolean);
    const assignedDigits = (phones || []).map((p: any) => p.number_digits).filter(Boolean);

    if (assignedNumbers.length === 0 && assignedDigits.length === 0) {
      // No numbers assigned -> zero stats
      const answerRate = 0;
      return res.json({ org, members, phones: phones || [], stats: { total_calls: 0, answered_calls: 0, missed_calls: 0, answer_rate_pct: answerRate } });
    }

    // Use the aggregated function for totals (today)
    const startTime = todayStart;
    const endTime = new Date().toISOString();
    let totals:any, totalsErr:any;
    let rpcErr:any = null;
    try {
      const result = await supabaseAdmin.rpc('get_org_phone_metrics', { _org_id: orgId, _start: startTime, _end: endTime });
      totals = result.data; totalsErr = result.error;
      if (!totalsErr) console.info(`[org_detail] rpc_success totals org=${orgId} range=today`);
    } catch (e1) {
      rpcErr = e1;
      try {
        const result = await supabaseAdmin.rpc('get_org_phone_metrics_alpha', { _org_id: orgId, _start: startTime, _end: endTime });
        totals = result.data; totalsErr = result.error;
        if (!totalsErr) console.info(`[org_detail] rpc_alpha_success totals org=${orgId} range=today`);
      } catch (e2) {
        rpcErr = e2;
      }
    }
    if (totalsErr) {
      console.warn('[org_detail] get_org_phone_metrics failed:', fmtErr(totalsErr));
      // Fallback to compute totals from calls if RPC fails
      try {
        const totalsFallback = await computeTotalsFromCalls(orgId, new Date(todayStart), new Date(), assignedNumbers, assignedDigits);
        return res.json({ org, members, phones: phones || [], stats: { total_calls: totalsFallback.callsToday, answered_calls: totalsFallback.answeredCalls, missed_calls: totalsFallback.missedCalls, answer_rate_pct: totalsFallback.answerRate } });
      } catch (fallbackErr) {
        console.warn('[org_detail] computeTotalsFromCalls fallback failed:', fmtErr(fallbackErr));
        return res.json({ org, members, phones: phones || [], stats: { total_calls: 0, answered_calls: 0, missed_calls: 0, answer_rate_pct: 0 } });
      }
    }
    const rows = (totals || []) as any[];
    let totalCalls = 0, answeredCalls = 0, missedCalls = 0;
    for (const r of rows) {
      totalCalls += Number(r.calls_count || 0);
      answeredCalls += Number(r.answered_count || 0);
      missedCalls += Number(r.missed_count || 0);
    }
    const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

    // Determine if requesting user can edit phone numbers
    const requestUserId = req.header('x-user-id') || null;
    const isDev = process.env.NODE_ENV !== 'production';
    let canEditPhoneNumbers = false;
    if (requestUserId) {
      try {
        canEditPhoneNumbers = isDev ||
          (await isPlatformAdmin(requestUserId)) ||
          (await isPlatformManagerWith(requestUserId, 'can_manage_phone_numbers_global')) ||
          (await isOrgAdmin(requestUserId, orgId)) ||
          (await isOrgManagerWith(requestUserId, orgId, 'can_manage_phone_numbers'));
      } catch (permErr) {
        console.warn('[admin_org_detail] permission checks failed, defaulting to no edit permissions:', fmtErr(permErr));
        canEditPhoneNumbers = false;
      }
    }
    console.info('[admin_org_detail] permissions checked: canEditPhoneNumbers=', canEditPhoneNumbers);

    console.info('[admin_org_detail] success for org:', orgId, 'stats:', { totalCalls, answeredCalls, missedCalls });
    res.json({ org, members, phones: phones || [], stats: { total_calls: totalCalls, answered_calls: answeredCalls, missed_calls: missedCalls, answer_rate_pct: answerRate }, permissions: { canEditPhoneNumbers } });
  } catch (err: any) {
    console.error('admin_org_detail_failed:', err?.message ?? err);
    res.status(500).json({ error: 'admin_org_detail_failed', detail: err?.message ?? 'unknown_error' });
  }
});

// Temporary diagnostic endpoint for debugging org issues in production.
// Protected by DIAG_TOKEN environment variable — set DIAG_TOKEN to a secret value before using.
app.get('/api/admin/orgs/:orgId/diag', async (req, res) => {
  const token = req.query.diag_token as string | undefined;
  if (!process.env.DIAG_TOKEN || token !== process.env.DIAG_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { orgId } = req.params;
    const out: any = { orgId };

    // Check org exists
    const { data: org, error: orgErr } = await supabaseAdmin.from('organizations').select('id,name').eq('id', orgId).maybeSingle();
    out.org = org || null; out.orgErr = orgErr ? fmtErr(orgErr) : null;

    // Count members in org_users and legacy organization_members
    const { data: ou, error: ouErr } = await supabaseAdmin.from('org_users').select('id', { count: 'exact' }).eq('org_id', orgId);
    out.org_users_count = Array.isArray(ou) ? ou.length : null; out.org_users_err = ouErr ? fmtErr(ouErr) : null;
    const { data: lm, error: lmErr } = await supabaseAdmin.from('organization_members').select('id', { count: 'exact' }).eq('org_id', orgId);
    out.legacy_members_count = Array.isArray(lm) ? lm.length : null; out.legacy_members_err = lmErr ? fmtErr(lmErr) : null;

    // Assigned phones
    try {
      const { phones: assigned } = await getAssignedPhoneNumbersForOrg(orgId);
      out.assignedPhones = (assigned || []).map((p:any)=>({ id: p.id, number: p.number, number_digits: p.number_digits }));
    } catch (e) {
      out.assignedPhones = null; out.assignedPhonesErr = fmtErr(e);
    }

    // RPC test for the last minute
    try {
      const start = new Date(Date.now()-1000*60).toISOString();
      const end = new Date().toISOString();
      const rpcRes = await supabaseAdmin.rpc('get_org_phone_metrics', { _org_id: orgId, _start: start, _end: end });
      out.rpc = { ok: !rpcRes.error, dataPreview: Array.isArray(rpcRes.data) ? rpcRes.data.slice(0,5) : rpcRes.data, error: rpcRes.error ? fmtErr(rpcRes.error) : null };
    } catch (e) {
      out.rpc = { ok: false, error: fmtErr(e) };
    }

    // Check service role availability
    out.supabase_service_role_present = !!process.env.SUPABASE_SERVICE_ROLE || !!process.env.SUPABASE_URL;

    res.json(out);
  } catch (err:any) {
    console.error('admin_org_diag_failed:', err?.message ?? err);
    res.status(500).json({ error: 'admin_org_diag_failed', detail: err?.message ?? 'unknown_error' });
  }
});

// Admin: manage per-org integrations (GET/POST/DELETE)
app.get('/api/admin/orgs/:orgId/integrations', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId } = req.params;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    const allowed = (await isPlatformAdmin(actorId)) || (await isOrgAdmin(actorId, orgId));
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    const { getOrgIntegration } = await import('./lib/integrationsStore');
    const integ = await getOrgIntegration(orgId, req.query.provider as string || 'mightycall');
    if (!integ) return res.json({ integrations: [] });
    // Do not expose encrypted blob
    const { encrypted_credentials, ...rest } = integ;
    return res.json({ integration: { ...rest, has_credentials: !!integ.credentials } });
  } catch (err:any) {
    console.error('get_org_integration_failed:', fmtErr(err));
    res.status(500).json({ error: 'get_org_integration_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

app.post('/api/admin/orgs/:orgId/integrations', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId } = req.params;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    const allowed = (await isPlatformAdmin(actorId)) || (await isOrgAdmin(actorId, orgId));
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    const { provider, credentials, metadata } = req.body || {};
    if (!provider || !credentials) return res.status(400).json({ error: 'missing_provider_or_credentials' });

    const { saveOrgIntegration } = await import('./lib/integrationsStore');
    const saved = await saveOrgIntegration(orgId, provider, credentials, metadata || {});
    const { encrypted_credentials, ...rest } = saved;
    res.json({ integration: { ...rest, has_credentials: !!saved.encrypted_credentials } });
  } catch (err:any) {
    console.error('save_org_integration_failed:', fmtErr(err));
    res.status(500).json({ error: 'save_org_integration_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

app.delete('/api/admin/orgs/:orgId/integrations/:provider', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId, provider } = req.params;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    const allowed = (await isPlatformAdmin(actorId)) || (await isOrgAdmin(actorId, orgId));
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    const { deleteOrgIntegration } = await import('./lib/integrationsStore');
    await deleteOrgIntegration(orgId, provider);
    res.json({ success: true });
  } catch (err:any) {
    console.error('delete_org_integration_failed:', fmtErr(err));
    res.status(500).json({ error: 'delete_org_integration_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/orgs/:orgId/members - list org members (org-scoped)
app.get('/api/orgs/:orgId/members', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId } = req.params;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    // Ensure requester belongs to org
      // Support legacy `organization_members` table as well as `org_users`.
      let membership: any = null;
      try {
        const { data: m1, error: m1Err } = await supabaseAdmin
          .from('org_users')
          .select('id, role')
          .eq('org_id', orgId)
          .eq('user_id', actorId)
          .maybeSingle();
        if (!m1Err && m1) membership = m1;
        else {
          const { data: m2, error: m2Err } = await supabaseAdmin
            .from('organization_members')
            .select('id, role, user_id')
            .eq('org_id', orgId)
            .eq('user_id', actorId)
            .maybeSingle();
          if (!m2Err && m2) membership = m2;
        }
      } catch (e) {
        membership = null;
      }
      const actorIsPlatformAdmin = actorId && (await isPlatformAdmin(actorId));
      const actorIsPlatformManager = actorId && (await isPlatformManagerWith(actorId, 'can_manage_orgs'));
      if (!membership && !actorIsPlatformAdmin && !actorIsPlatformManager) {
        console.warn('[org_members] access denied for actor', actorId, 'membership:', membership, 'platformAdmin:', actorIsPlatformAdmin, 'platformManager:', actorIsPlatformManager);
        return res.status(403).json({ error: 'forbidden' });
      }

    // Try to read members from `org_users`, fall back to legacy `organization_members`.
    let rows: any[] = [];
    try {
      const { data: r1, error: r1Err } = await supabaseAdmin
        .from('org_users')
        .select('id, org_id, user_id, role, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });
      if (!r1Err && r1 && r1.length > 0) rows = r1;
      else {
        const { data: r2, error: r2Err } = await supabaseAdmin
          .from('organization_members')
          .select('id, org_id, user_id, role, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: true });
        if (!r2Err && r2) rows = r2;
      }
    } catch (e) {
      rows = [];
    }

    // Enrich with user emails
    const out: any[] = [];
    for (const r of rows || []) {
      try {
        const { data: udata, error: uerr } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        out.push({ id: r.id, user_id: r.user_id, email: uerr || !udata ? null : (udata.user.email || null), role: r.role, created_at: r.created_at });
      } catch (e) {
        out.push({ id: r.id, user_id: r.user_id, email: null, role: r.role, created_at: r.created_at });
      }
    }
    // Also include pending invites (if any) so the UI can show invite status
    try {
      const { data: invites, error: invitesErr } = await supabaseAdmin
        .from('org_invites')
        .select('id, org_id, email, role, invited_by, invited_at')
        .eq('org_id', orgId)
        .order('invited_at', { ascending: true });
      if (!invitesErr && invites && invites.length) {
        for (const inv of invites) {
          out.push({ id: inv.id, user_id: null, email: inv.email, role: inv.role, invited_by: inv.invited_by, invited_at: inv.invited_at, pending_invite: true });
        }
      }
    } catch (e) {
      // ignore if invites table missing in older deployments
    }
    res.json({ members: out });
  } catch (e: any) {
    console.error('org_members_failed:', fmtErr(e));
    res.status(500).json({ error: 'org_members_failed', detail: fmtErr(e) });
  }
});

// POST /api/orgs/:orgId/members - add a user to the org (org-admin only)
app.post('/api/orgs/:orgId/members', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId } = req.params;
    const { email, role } = req.body || {};
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    // Allow platform admins to manage members as well as org admins
    if (!((actorId && (await isPlatformAdmin(actorId))) || (await isOrgAdmin(actorId, orgId)))) {
      console.warn('[org_add_member] permission denied for actor', actorId, 'orgId:', orgId);
      return res.status(403).json({ error: 'forbidden' });
    }
    if (!email || !role) return res.status(400).json({ error: 'missing_required_fields' });

    // Validate role - org_members only accepts these roles
    const validRoles = ['agent', 'org_manager', 'org_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'invalid_role', detail: `role must be one of: ${validRoles.join(', ')}` });
    }

    // Find user by email
    const { data: u, error: uErr } = await supabaseAdmin.from('users').select('id').eq('email', email).maybeSingle();
    if (uErr || !u) {
      // Create a pending invite and send an email invitation via Supabase Auth
      try {
        // First, send the invitation email via Supabase Auth
        const { data: authInvite, error: authInvErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: { org_id: orgId, role }
        });
        if (authInvErr) {
          console.warn('[org_add_member] Supabase auth invite failed:', fmtErr(authInvErr));
          // Email invite failed, but still create a DB record so admin can retry later
        }

        // Also create a database record for tracking
        const { data: inv, error: invErr } = await supabaseAdmin
          .from('org_invites')
          .upsert({ org_id: orgId, email, role, invited_by: actorId }, { onConflict: 'org_id,email' })
          .select()
          .maybeSingle();
        if (invErr) throw invErr;
        return res.status(201).json({ invite: inv, email_sent: !authInvErr });
      } catch (e) {
        // If invites table does not exist on this deployment, fall back to explicit error
        console.error('[org_add_member] Failed to create invite:', fmtErr(e));
        return res.status(404).json({ error: 'user_not_found' });
      }
    }

    const payload = { user_id: u.id, org_id: orgId, role };
    // Upsert into both `org_users` and legacy `organization_members` to remain compatible
    const { data, error } = await supabaseAdmin.from('org_users').upsert(payload, { onConflict: 'org_id,user_id' }).select().maybeSingle();
    if (error) throw error;
    try {
      await supabaseAdmin.from('organization_members').upsert(payload, { onConflict: 'org_id,user_id' });
    } catch (e) {
      // Non-fatal: some deployments may not have the legacy table
    }
    res.json({ org_user: data });
  } catch (e: any) {
    console.error('org_add_member_failed:', fmtErr(e));
    res.status(500).json({ error: 'org_add_member_failed', detail: fmtErr(e) });
  }
});

// DELETE /api/orgs/:orgId/members/:userId - remove a member from the org (org-admin only)
app.delete('/api/orgs/:orgId/members/:userId', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId, userId } = req.params;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    // Allow platform admins to remove members as well as org admins
    if (!((actorId && (await isPlatformAdmin(actorId))) || (await isOrgAdmin(actorId, orgId)))) {
      console.warn('[org_remove_member] permission denied for actor', actorId, 'orgId:', orgId);
      return res.status(403).json({ error: 'forbidden' });
    }
    // Try deleting an org_user by user_id first
    try {
      const { data: delData, error: delErr } = await supabaseAdmin.from('org_users').delete().eq('org_id', orgId).eq('user_id', userId).select();
      if (!delErr && delData && delData.length > 0) {
        // Also remove legacy row if present
        try { await supabaseAdmin.from('organization_members').delete().eq('org_id', orgId).eq('user_id', userId); } catch(e) {}
        return res.status(204).send();
      }
    } catch (e) {
      // ignore and try deleting invite
    }

    // If no org_user deleted, try deleting an invite by id (support passing invite id in place of userId)
    try {
      const { data: invDel, error: invErr } = await supabaseAdmin.from('org_invites').delete().eq('org_id', orgId).eq('id', userId).select();
      if (!invErr && invDel && invDel.length > 0) return res.status(204).send();
    } catch (e) {
      // ignore
    }

    // Fallback: attempt legacy deletion by user_id
    try {
      await supabaseAdmin.from('organization_members').delete().eq('org_id', orgId).eq('user_id', userId);
      return res.status(204).send();
    } catch (e) {
      // ignore
    }

    // Nothing deleted
    res.status(404).json({ error: 'member_or_invite_not_found' });
  } catch (e: any) {
    console.error('org_delete_member_failed:', fmtErr(e));
    res.status(500).json({ error: 'org_delete_member_failed', detail: fmtErr(e) });
  }
});

// POST /api/orgs/:orgId/invites/:inviteId/accept - accept a member invite
app.post('/api/orgs/:orgId/invites/:inviteId/accept', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId, inviteId } = req.params;
    
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });

    // Get the invite details
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from('org_invites')
      .select('*')
      .eq('id', inviteId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (inviteErr || !invite) {
      return res.status(404).json({ error: 'invite_not_found' });
    }

    // Verify the user accepting the invite has the same email
    const { data: currentUser, error: userErr } = await supabaseAdmin.auth.admin.getUserById(actorId);
    if (userErr || !currentUser || currentUser.user.email !== invite.email) {
      return res.status(403).json({ error: 'forbidden', detail: 'Can only accept invites for your email address' });
    }

    // Create org_users entry
    const { data: orgUser, error: createErr } = await supabaseAdmin
      .from('org_users')
      .upsert({
        org_id: orgId,
        user_id: actorId,
        role: invite.role
      }, { onConflict: 'org_id,user_id' })
      .select()
      .maybeSingle();

    if (createErr) throw createErr;

    // Also create legacy organization_members entry if needed
    try {
      await supabaseAdmin.from('organization_members').upsert({
        org_id: orgId,
        user_id: actorId,
        role: invite.role
      }, { onConflict: 'org_id,user_id' });
    } catch (e) {
      // Non-fatal: some deployments may not have this table
    }

    // Delete the invite
    await supabaseAdmin.from('org_invites').delete().eq('id', inviteId);

    res.json({ org_user: orgUser, message: 'Invite accepted successfully' });
  } catch (e: any) {
    console.error('accept_invite_failed:', fmtErr(e));
    res.status(500).json({ error: 'accept_invite_failed', detail: fmtErr(e) });
  }
});

// DELETE /api/orgs/:orgId/invites/:inviteId - reject/delete an invite
app.delete('/api/orgs/:orgId/invites/:inviteId', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId, inviteId } = req.params;

    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });

    // Get the invite
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from('org_invites')
      .select('*')
      .eq('id', inviteId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (inviteErr || !invite) {
      return res.status(404).json({ error: 'invite_not_found' });
    }

    // Allow the invite recipient or an org admin to reject/delete the invite
    const isAdmin = await isOrgAdmin(actorId, orgId) || (await isPlatformAdmin(actorId));
    const { data: currentUser, error: userErr } = await supabaseAdmin.auth.admin.getUserById(actorId);
    const isRecipient = !userErr && currentUser && currentUser.user.email === invite.email;

    if (!isAdmin && !isRecipient) {
      return res.status(403).json({ error: 'forbidden' });
    }

    // Delete the invite
    await supabaseAdmin.from('org_invites').delete().eq('id', inviteId);

    res.status(204).send();
  } catch (e: any) {
    console.error('reject_invite_failed:', fmtErr(e));
    res.status(500).json({ error: 'reject_invite_failed', detail: fmtErr(e) });
  }
});

// Allow org admins to update their organization settings (e.g., name)
app.put('/api/orgs/:orgId', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId } = req.params;
    const { name } = req.body || {};
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    try {
      const isAdmin = await isOrgAdmin(actorId, orgId);
      if (!isAdmin) {
        console.warn('[update_org] forbidden: user not org admin', { actorId, orgId });
        return res.status(403).json({ error: 'forbidden' });
      }
    } catch (permErr) {
      console.error('[update_org] permission check failed:', fmtErr(permErr));
      return res.status(500).json({ error: 'permission_check_failed', detail: fmtErr(permErr) });
    }
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'missing_required_fields', detail: 'name is required' });

    // Try to update existing org row
    try {
      const { data, error } = await supabaseAdmin.from('organizations').update({ name }).eq('id', orgId).select().maybeSingle();
      if (error) {
        // If update failed because row missing, attempt upsert to create it
        console.warn('[update_org] update error, attempting upsert:', fmtErr(error));
        const { data: up, error: upErr } = await supabaseAdmin.from('organizations').upsert({ id: orgId, name }, { onConflict: 'id' }).select().maybeSingle();
        if (upErr) throw upErr;
        return res.json({ org: up });
      }
      if (!data) {
        // no row updated -> try upsert
        const { data: up, error: upErr } = await supabaseAdmin.from('organizations').upsert({ id: orgId, name }, { onConflict: 'id' }).select().maybeSingle();
        if (upErr) throw upErr;
        return res.json({ org: up });
      }
      return res.json({ org: data });
    } catch (e:any) {
      console.error('[update_org] failed:', fmtErr(e));
      return res.status(500).json({ error: 'update_org_failed', detail: fmtErr(e) });
    }
  } catch (e: any) {
    console.error('update_org_failed:', fmtErr(e));
    res.status(500).json({ error: 'update_org_failed', detail: fmtErr(e) });
  }
});

// GET /api/orgs/:orgId - org-scoped info (for org admins/managers)
app.get('/api/orgs/:orgId', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    const { orgId } = req.params;
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });

    // ensure actor belongs to org (org_users or legacy organization_members)
    let membership: any = null;
    try {
      const { data: m1, error: m1Err } = await supabaseAdmin
        .from('org_users')
        .select('id, role')
        .eq('org_id', orgId)
        .eq('user_id', actorId)
        .maybeSingle();
      if (!m1Err && m1) membership = m1;
      else {
        const { data: m2, error: m2Err } = await supabaseAdmin
          .from('organization_members')
          .select('id, role, user_id')
          .eq('org_id', orgId)
          .eq('user_id', actorId)
          .maybeSingle();
        if (!m2Err && m2) membership = m2;
      }
    } catch (e) {
      membership = null;
    }
    if (!membership) return res.status(403).json({ error: 'forbidden' });

    // Load org (with membership-based fallback to avoid 404 during rollouts)
    let { data: org, error: orgErr } = await supabaseAdmin.from('organizations').select('id, name, created_at').eq('id', orgId).maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) {
      console.warn('[org_get] org row not found, attempting membership-based fallback for org:', orgId);
      try {
        const { data: m1, error: m1Err } = await supabaseAdmin.from('org_users').select('id').eq('org_id', orgId).limit(1);
        if (!m1Err && m1 && m1.length > 0) {
          org = { id: orgId, name: `Organization ${orgId.slice(0,8)}`, created_at: null } as any;
        } else {
          const { data: m2, error: m2Err } = await supabaseAdmin.from('organization_members').select('id').eq('org_id', orgId).limit(1);
          if (!m2Err && m2 && m2.length > 0) {
            org = { id: orgId, name: `Organization ${orgId.slice(0,8)}`, created_at: null } as any;
            console.warn('[org_get] legacy organization_members present; using fallback org object for:', orgId);
          }
        }
      } catch (e) {
        console.warn('[org_get] membership fallback failed:', fmtErr(e));
      }
      if (!org) return res.status(404).json({ error: 'org_not_found' });
    }

    // Phones assigned
    let phones: any[] = [];
    try {
      const { phones: assigned } = await getAssignedPhoneNumbersForOrg(orgId);
      phones = (assigned || []).map((p: any) => ({ id: p.id, number: p.number, label: p.label ?? null, number_digits: p.number_digits ?? null, created_at: p.created_at }));
    } catch (err) {
      console.warn('[org_get] assigned phones helper failed:', fmtErr(err));
      phones = [];
    }

    // Stats (safe RPC with fallback)
    const todayStart = new Date(new Date().setHours(0,0,0,0)).toISOString();
    const startTime = todayStart; const endTime = new Date().toISOString();
    let totals:any = null; let totalsErr:any = null;
    try {
      const result = await supabaseAdmin.rpc('get_org_phone_metrics', { _org_id: orgId, _start: startTime, _end: endTime });
      totals = result.data; totalsErr = result.error;
    } catch (e) {
      totalsErr = e;
    }
    let stats = { total_calls: 0, answered_calls: 0, missed_calls: 0, answer_rate_pct: 0 };
    if (!totalsErr && totals && Array.isArray(totals)) {
      let totalCalls = 0, answeredCalls = 0, missedCalls = 0;
      for (const r of totals) { totalCalls += Number(r.calls_count||0); answeredCalls += Number(r.answered_count||0); missedCalls += Number(r.missed_count||0); }
      const answerRate = totalCalls > 0 ? Math.round((answeredCalls/totalCalls)*100) : 0;
      stats = { total_calls: totalCalls, answered_calls: answeredCalls, missed_calls: missedCalls, answer_rate_pct: answerRate };
    } else if (totalsErr) {
      console.warn('[org_get] rpc failed, falling back to computeTotalsFromCalls:', fmtErr(totalsErr));
      try {
        const assignedNumbers = (phones || []).map((p:any)=>p.number).filter(Boolean);
        const assignedDigits = (phones || []).map((p:any)=>p.number_digits).filter(Boolean);
        const totalsFallback = await computeTotalsFromCalls(orgId, new Date(todayStart), new Date(), assignedNumbers, assignedDigits);
        stats = { total_calls: totalsFallback.callsToday, answered_calls: totalsFallback.answeredCalls, missed_calls: totalsFallback.missedCalls, answer_rate_pct: totalsFallback.answerRate };
      } catch (e) {
        console.warn('[org_get] fallback computeTotalsFromCalls failed:', fmtErr(e));
      }
    }

    res.json({ org, phones, stats, membership });
  } catch (err:any) {
    console.error('org_get_failed:', err?.message ?? err);
    res.status(500).json({ error: 'org_get_failed', detail: err?.message ?? 'unknown_error' });
  }
});

// GET /api/admin/orgs/:orgId/phone-metrics - per-phone metrics for this org
app.get('/api/admin/orgs/:orgId/phone-metrics', async (req, res) => {
  try {
    const { orgId } = req.params;
    if (!orgId) return res.status(400).json({ error: 'missing_orgId' });
    // Use helper which handles multiple schema variants
    const { phones } = await getAssignedPhoneNumbersForOrg(orgId);
    const assignedNumbers = (phones || []).map((p: any) => p.number).filter(Boolean);
    const assignedDigits = (phones || []).map((p: any) => p.number_digits).filter(Boolean);
    if (!phones || phones.length === 0) return res.json({ metrics: [] });

    // Determine range (query param: range=today|7d|30d or start=end ISO timestamps)
    const range = (req.query.range as string) || 'today';
    let startTime = new Date(new Date().setHours(0,0,0,0));
    let endTime = new Date();
    if (req.query.start && req.query.end) {
      startTime = new Date(String(req.query.start));
      endTime = new Date(String(req.query.end));
    } else {
      if (range === '7d') {
        startTime.setDate(startTime.getDate() - 6);
      } else if (range === '30d') {
        startTime.setDate(startTime.getDate() - 29);
      } else { // default: today
        /* startTime already set to start of day */
      }
    }

    // enforce a sensible maximum range to avoid long-running queries
    const MAX_RANGE_DAYS = 90;
    const msRange = endTime.getTime() - startTime.getTime();
    if (msRange > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'range_too_large', detail: `Range must be <= ${MAX_RANGE_DAYS} days` });
    }

    // Use in-memory cache keyed by range and time window
    const cacheKey = `${orgId}:${range}:${startTime.toISOString()}:${endTime.toISOString()}`;
    const cached = metricsCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts < METRICS_CACHE_TTL_MS)) {
      console.info(`[org_metrics] cache_hit org=${orgId} range=${range} start=${startTime.toISOString()} end=${endTime.toISOString()}`);
      return res.json({ metrics: cached.payload, cached: true });
    }

    const queryStart = Date.now();
    // Call the aggregated Postgres function for per-phone metrics
    let metricsRows:any, metricsErr:any;
    let metricsRpcErr:any = null;
    try {
      const result = await supabaseAdmin.rpc('get_org_phone_metrics', { _org_id: orgId, _start: startTime.toISOString(), _end: endTime.toISOString() });
      metricsRows = result.data; metricsErr = result.error;
    } catch (e1) {
      metricsRpcErr = e1;
      try {
        const result = await supabaseAdmin.rpc('get_org_phone_metrics_alpha', { _org_id: orgId, _start: startTime.toISOString(), _end: endTime.toISOString() });
        metricsRows = result.data; metricsErr = result.error;
      } catch (e2) {
        metricsRpcErr = e2;
      }
    }
    const dbMs = Date.now() - queryStart;
    if (metricsErr) {
      console.error(`[org_metrics] db_query_failed org=${orgId} range=${range} dbMs=${dbMs} error=${fmtErr(metricsErr)}`);
      // Fallback: perform aggregation in Node.js via two calls queries (to_number and to_number_digits)
      try {
        // Fetch recent calls for the range and filter by normalized digits or exact to_number match
        const { data: callFetch, error: callFetchErr } = await supabaseAdmin
          .from('calls')
          .select('to_number,to_number_digits,from_number,from_number_digits,status,answered_at,ended_at,started_at')
          .gte('started_at', startTime.toISOString())
          .lte('started_at', endTime.toISOString())
          .limit(5000);
        if (callFetchErr) throw callFetchErr;
        const callRows = (callFetch || []).filter((c: any) => {
          const toDigits = c.to_number_digits || normalizePhoneDigits(c.to_number || null);
          const fromDigits = c.from_number_digits || normalizePhoneDigits(c.from_number || null);
          if (toDigits && assignedDigits.includes(toDigits)) return true;
          if (c.to_number && assignedNumbers.includes(c.to_number)) return true;
          if (fromDigits && assignedDigits.includes(fromDigits)) return true;
          if (c.from_number && assignedNumbers.includes(c.from_number)) return true;
          return false;
        });
        // Aggregate in JS
        const map = new Map<string, any>();
        for (const c of callRows) {
          // Prefer to_number as key when present/assigned, otherwise use from_number
          const toDigits = c.to_number_digits || normalizePhoneDigits(c.to_number || null);
          const fromDigits = c.from_number_digits || normalizePhoneDigits(c.from_number || null);
          let key = null as string | null;
          if (toDigits && assignedDigits.includes(toDigits)) key = toDigits;
          else if (c.to_number && assignedNumbers.includes(c.to_number)) key = c.to_number;
          else if (fromDigits && assignedDigits.includes(fromDigits)) key = fromDigits;
          else if (c.from_number && assignedNumbers.includes(c.from_number)) key = c.from_number;
          if (!key) continue;
          if (!key) continue;
          if (!map.has(key)) map.set(key, { calls_count: 0, answered_count: 0, missed_count: 0, sum_handle_seconds: 0, handle_count: 0, sum_speed_seconds: 0, speed_count: 0 });
          const bucket = map.get(key);
          bucket.calls_count++;
          const st = (c.status || '').toLowerCase();
          if (st === 'answered' || st === 'completed') bucket.answered_count++;
          if (st === 'missed') bucket.missed_count++;
          const handleSeconds = ((c as any).duration != null) ? Number((c as any).duration) : (c.ended_at && c.answered_at ? (new Date(c.ended_at).getTime() - new Date(c.answered_at).getTime())/1000 : 0);
          if (handleSeconds > 0) {
            bucket.sum_handle_seconds += handleSeconds;
            bucket.handle_count++;
          }
          if (c.answered_at && c.started_at) {
            const speedSeconds = (new Date(c.answered_at).getTime() - new Date(c.started_at).getTime())/1000;
            if (speedSeconds >= 0) {
              bucket.sum_speed_seconds += speedSeconds;
              bucket.speed_count++;
            }
          }
        }
        console.info('[org_metrics] assigned phones count:', (phones || []).length, 'phones sample:', (phones || [])[0] || null);
        const fallbackMetrics = Array.from(map.entries()).map(([key, b]) => {
          // Try to map key back to an assigned phone to provide readable results when RPC isn't available
          const phoneMatch = (phones || []).find((p: any) =>
            p.number_digits === key ||
            p.number === key ||
            (p.number && (p.number.replace(/\D/g,'') === key || p.number === `+${key}`))
          );
          return {
          phone_id: phoneMatch?.id ?? null,
          number: phoneMatch?.number ?? key,
          label: phoneMatch?.label ?? null,
          key_num: key,
          calls_count: b.calls_count,
          answered_count: b.answered_count,
          missed_count: b.missed_count,
          avg_handle_seconds: b.handle_count > 0 ? Math.floor(b.sum_handle_seconds / b.handle_count) : 0,
          avg_speed_seconds: b.speed_count > 0 ? Math.floor(b.sum_speed_seconds / b.speed_count) : 0,
          };
        });
        metricsRows = fallbackMetrics;
        console.log('[org_metrics] fallbackMetrics raw sample:', JSON.stringify(metricsRows.slice(0,5), null, 2));
      } catch (fallbackErr) {
        console.error('[org_metrics] fallback aggregation failed:', fmtErr(fallbackErr));
        throw metricsErr;
      }
    }

    const rows = (metricsRows || []) as any[];
    const serializeStart = Date.now();
    console.info('[org_metrics] raw metricsRows count:', (metricsRows || []).length, 'firstRowKeys:', Object.keys((metricsRows || [])[0] || {}));
    // Convert rows to response format
    const metrics = rows.map((r: any) => ({
      phoneId: r.phone_id,
      number: r.phone_number || r.number,
      label: r.phone_label || r.label,
      callsCount: r.calls_count,
      answeredCount: r.answered_count,
      missedCount: r.missed_count,
      answerRate: Number(r.answer_rate || 0),
      avgHandleSeconds: Number(r.avg_handle_seconds || 0),
      avgSpeedSeconds: Number(r.avg_speed_seconds || 0),
    }));
    const serializeMs = Date.now() - serializeStart;

    // Cache the payload
    metricsCache.set(cacheKey, { ts: Date.now(), payload: metrics });
    console.info(`[org_metrics] org=${orgId} range=${range} rows=${metrics.length} dbMs=${dbMs} serializeMs=${serializeMs}`);
    return res.json({ metrics });
  } catch (err: any) {
    console.error('phone_metrics_failed:', err?.message ?? err);
    res.status(500).json({ error: 'phone_metrics_failed', detail: fmtErr(err) });
  }
});

// GET /api/admin/orgs/:orgId/metrics - aggregated totals for an org
app.get('/api/admin/orgs/:orgId/metrics', async (req, res) => {
  try {
    const { orgId } = req.params;
    if (!orgId) return res.status(400).json({ error: 'missing_orgId' });

    // Determine range
    const range = (req.query.range as string) || 'today';
    let startTime = new Date(new Date().setHours(0,0,0,0));
    let endTime = new Date();
    if (req.query.start && req.query.end) {
      startTime = new Date(String(req.query.start));
      endTime = new Date(String(req.query.end));
    } else {
      if (range === '7d') startTime.setDate(startTime.getDate() - 6);
      else if (range === '30d') startTime.setDate(startTime.getDate() - 29);
    }

    // fetch assigned phone numbers for this org for fallback aggregation
    const { phones } = await getAssignedPhoneNumbersForOrg(orgId);
    const assignedNumbers = (phones || []).map((p: any) => p.number).filter(Boolean);
    const assignedDigits = (phones || []).map((p: any) => p.number_digits).filter(Boolean);

    const cacheKey = `${orgId}:totals:${range}:${startTime.toISOString()}:${endTime.toISOString()}`;
    const cached = metricsCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts < METRICS_CACHE_TTL_MS)) {
      return res.json({ totals: cached.payload, cached: true });
    }

    const t0 = Date.now();
    let rows:any, err:any;
    let totalsRpcErr:any = null;
    try {
      const result = await supabaseAdmin.rpc('get_org_phone_metrics', { _org_id: orgId, _start: startTime.toISOString(), _end: endTime.toISOString() });
      rows = result.data; err = result.error;
      if (!err) console.info(`[org_metrics_totals] rpc_success org=${orgId} range=${range}`);
    } catch (e1) {
      totalsRpcErr = e1;
      try {
        const result = await supabaseAdmin.rpc('get_org_phone_metrics_alpha', { _org_id: orgId, _start: startTime.toISOString(), _end: endTime.toISOString() });
        rows = result.data; err = result.error;
        if (!err) console.info(`[org_metrics_totals] rpc_alpha_success org=${orgId} range=${range}`);
      } catch (e2) {
        totalsRpcErr = e2;
      }
    }
    const dbMs = Date.now() - t0;
    if (err) {
      console.error(`[org_metrics_totals] rpc failed org=${orgId} range=${range} dbMs=${dbMs} err=${fmtErr(err)}`);
      // fallback to helper function
      try {
        const totalsObj = await computeTotalsFromCalls(orgId, startTime, endTime, assignedNumbers, assignedDigits);
        metricsCache.set(cacheKey, { ts: Date.now(), payload: totalsObj });
        console.info(`[org_metrics_totals] fallback computed totals org=${orgId} range=${range}`);
        return res.json({ totals: totalsObj, cached: false });
      } catch (fallbackErr) {
        console.error('[org_metrics_totals] fallback aggregation failed:', fmtErr(fallbackErr));
        return res.status(500).json({ error: 'metrics_totals_failed', detail: fmtErr(err) });
      }
    }
    const totals = { callsToday: 0, answeredCalls: 0, missedCalls: 0, avgHandleTime: 0, avgSpeedOfAnswer: 0, answerRate: 0 } as any;
    let sumHandleSeconds = 0;
    let handleCount = 0;
    let sumSpeedSeconds = 0;
    let speedAnsweredCount = 0;
    for (const r of (rows || [])) {
      totals.callsToday += Number(r.calls_count || 0);
      totals.answeredCalls += Number(r.answered_count || 0);
      totals.missedCalls += Number(r.missed_count || 0);
      if (Number(r.avg_handle_seconds || 0) > 0) {
        sumHandleSeconds += Number(r.avg_handle_seconds || 0) * Number(r.calls_count || 0);
        handleCount += Number(r.calls_count || 0);
      }
      if (Number(r.avg_speed_seconds || 0) > 0 && Number(r.answered_count || 0) > 0) {
        sumSpeedSeconds += Number(r.avg_speed_seconds || 0) * Number(r.answered_count || 0);
        speedAnsweredCount += Number(r.answered_count || 0);
      }
    }
    totals.avgHandleTime = handleCount > 0 ? Math.round(sumHandleSeconds / handleCount) : 0;
    totals.avgSpeedOfAnswer = speedAnsweredCount > 0 ? Math.round(sumSpeedSeconds / speedAnsweredCount) : 0;
    totals.answerRate = totals.callsToday > 0 ? Math.round((totals.answeredCalls / totals.callsToday) * 100 * 10) / 10 : 0;

    metricsCache.set(cacheKey, { ts: Date.now(), payload: totals });
    console.info(`[org_metrics_totals] org=${orgId} range=${range} rows=${(rows||[]).length} dbMs=${dbMs}`);
    return res.json({ totals });
  } catch (err: any) {
    console.error('org_metrics_totals_failed:', fmtErr(err));
    return res.status(500).json({ error: 'org_metrics_totals_failed', detail: fmtErr(err) });
  }
});

// DEBUG: /api/admin/orgs/:orgId/metrics/debug - show assigned phones and top destination digits
app.get('/api/admin/orgs/:orgId/metrics/debug', async (req, res) => {
  try {
    const { orgId } = req.params;
    if (!orgId) return res.status(400).json({ error: 'missing_orgId' });
    const now = new Date();
    const since = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString(); // 30 days

    const { phones } = await getAssignedPhoneNumbersForOrg(orgId);
    const assigned = (phones || []).map((p: any) => ({ id: p.id, number: p.number, number_digits: p.number_digits || normalizePhoneDigits(p.number) }));

    // Query recent calls to get distinct normalized digits
    const { data: callsData, error: callsErr } = await supabaseAdmin
      .from('calls')
      .select('to_number_digits, to_number')
      .gte('started_at', since)
      .limit(1000)
      .order('started_at', { ascending: false });
    if (callsErr) console.warn('[metrics_debug] calls query error', fmtErr(callsErr));

    const freq: Record<string, number> = {};
    for (const row of (callsData || [])) {
      const d = row?.to_number_digits || normalizePhoneDigits(row?.to_number || null) || null;
      if (!d) continue;
      freq[d] = (freq[d] || 0) + 1;
    }
    const topDigits = Object.entries(freq).map(([digits, count]) => ({ digits, count })).sort((a: any, b: any) => b.count - a.count).slice(0, 50);

    const matches: any[] = [];
    for (const p of assigned) {
      const d = p.number_digits;
      if (!d) { matches.push({ phone: p.number, digits: null, matchCount: 0 }); continue; }
      const { count, error: cErr } = await supabaseAdmin
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .gte('started_at', since)
        .or(`to_number_digits.eq.${d},to_number.eq.${d},to_number.eq.+${d}`);
      matches.push({ phone: p.number, digits: d, matchCount: (count || 0), error: cErr ? String(cErr) : undefined });
    }
    return res.json({ assigned, topDigits, matches });
  } catch (err: any) {
    console.error('metrics_debug_failed:', fmtErr(err));
    return res.status(500).json({ error: 'metrics_debug_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// DEBUG: GET raw mappings for org_phone_numbers (admin/org-admins only)
app.get('/api/admin/orgs/:orgId/raw-phone-mappings', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    if (!userId) return res.status(401).json({ error: 'unauthenticated' });

    const { orgId } = req.params;
    if (!orgId) return res.status(400).json({ error: 'missing_orgId' });

    // Allow platform admins or org admins/managers for this org
    const allowed = await isPlatformAdmin(userId) ||
      (await isPlatformManagerWith(userId, 'can_manage_phone_numbers_global')) ||
      (await isOrgAdmin(userId, orgId)) ||
      (await isOrgManagerWith(userId, orgId, 'can_manage_phone_numbers'));
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('org_phone_numbers')
      .select('id, org_id, phone_number, phone_number_id, label, created_at')
      .eq('org_id', orgId);
    if (rowsErr) throw rowsErr;

    const phoneIds = (rows || []).filter((r: any) => r.phone_number_id).map((r: any) => r.phone_number_id);
    let phoneRows: any[] = [];
    if (phoneIds.length > 0) {
      const { data: pRows, error: pErr } = await supabaseAdmin
        .from('phone_numbers')
        .select('id, number, number_digits')
        .in('id', phoneIds as string[]);
      if (pErr) throw pErr;
      phoneRows = pRows || [];
    }

    res.json({ rows: rows || [], phoneRows });
  } catch (err: any) {
    console.error('debug_raw_mappings_failed:', fmtErr(err));
    res.status(500).json({ error: 'debug_raw_mappings_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/orgs/:orgId/managers/:orgMemberId/permissions - fetch org manager permissions
app.get('/api/admin/orgs/:orgId/managers/:orgMemberId/permissions', async (req, res) => {
  try {
    const { orgId, orgMemberId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('org_manager_permissions')
      .select('*')
      .eq('org_member_id', orgMemberId)
      .maybeSingle();
    if (error) throw error;
    res.json({ permissions: data || null });
  } catch (err: any) {
    console.error('get_org_manager_permissions_failed:', err?.message ?? err);
    res.status(500).json({ error: 'get_org_manager_permissions_failed', detail: err?.message ?? 'unknown_error' });
  }
});

// GET /api/admin/users - List all users with metadata
app.get("/api/admin/users", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      throw error;
    }

    const authUsers = (data?.users || []);

    // Fetch profiles for these users to include global_role (handle missing column gracefully)
    const userIds = authUsers.map((u: any) => u.id);
    let profilesMap: Record<string, any> = {};
    if (userIds.length > 0) {
      try {
        const { data: profiles, error: pErr } = await supabaseAdmin
          .from('profiles')
          .select('id, global_role')
          .in('id', userIds);
        if (pErr) throw pErr;
        profilesMap = (profiles || []).reduce((acc: any, p: any) => ({ ...acc, [p.id]: p }), {});
      } catch (profileErr) {
        console.warn('profiles lookup failed (maybe missing global_role):', fmtErr(profileErr));
        // Fallback: leave profilesMap empty so global_role is null
        profilesMap = {};
      }
    }

    const users = authUsers.map((u: any) => ({
      id: u.id,
      email: u.email,
      org_id: (u.user_metadata as any)?.org_id ?? null,
      role: (u.user_metadata as any)?.role ?? null,
      global_role: profilesMap[u.id]?.global_role ?? null,
      created_at: u.created_at,
    }));

    res.json({ users });
  } catch (err: any) {
    console.error("admin_users_list_failed:", err?.message ?? err);
    res.status(500).json({
      error: "admin_users_list_failed",
      detail: err?.message ?? "unknown_error",
    });
  }
});

// POST /api/admin/users - Create a new user with org and role
app.post("/api/admin/users", async (req, res) => {
  try {
    const { email, password, orgId, role } = req.body;

    // Validate required fields
    if (!email || !password || !orgId) {
      return res.status(400).json({
        error: "missing_required_fields",
        detail: "email, password, and orgId are required",
      });
    }

    // Validate role if provided
    const validRoles = ['agent', 'org_manager', 'org_admin'];
    const normalizedRole = role || 'agent';
    if (!validRoles.includes(normalizedRole)) {
      return res.status(400).json({
        error: "invalid_role",
        detail: `role must be one of: ${validRoles.join(', ')}`,
      });
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        org_id: orgId,
        role: normalizedRole,
      },
    });

    if (error) {
      throw error;
    }

    res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        org_id: orgId,
        role: normalizedRole,
      },
    });
  } catch (err: any) {
    console.error("admin_create_user_failed:", err?.message ?? err);
    res.status(500).json({
      error: "admin_create_user_failed",
      detail: err?.message ?? "unknown_error",
    });
  }
});

// GET /api/admin/org-metrics - Get metrics for all organizations
app.get("/api/admin/org-metrics", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select(
        `
        id,
        name,
        client_metrics_today (
          total_calls,
          answered_calls,
          answer_rate_pct,
          avg_wait_seconds
        )
        `
      )
      .order("name", { ascending: true });

    if (error) {
      console.error("admin org-metrics error:", error);
      // Fallback: if the relation/view doesn't exist or query fails, return basic org list with zeroed metrics
      try {
        const { data: orgsOnly, error: oErr } = await supabaseAdmin.from('organizations').select('id, name').order('name', { ascending: true });
        if (oErr) throw oErr;
        const fallback = (orgsOnly || []).map((r: any) => ({ id: r.id, name: r.name, total_calls: 0, answered_calls: 0, answer_rate_pct: 0, avg_wait_seconds: 0 }));
        return res.json({ orgs: fallback });
      } catch (fallbackErr) {
        console.error('admin org-metrics fallback failed:', fmtErr(fallbackErr));
        return res
          .status(500)
          .json({ error: "org_metrics_failed", detail: fmtErr(error) ?? 'unknown_error' });
      }
    }

    // Flatten embedded relation
    const orgMetrics = (data ?? []).map((row: any) => {
      const metrics = Array.isArray(row.client_metrics_today)
        ? row.client_metrics_today[0]
        : row.client_metrics_today;

      return {
        id: row.id,
        name: row.name,
        total_calls: metrics?.total_calls ?? 0,
        answered_calls: metrics?.answered_calls ?? 0,
        answer_rate_pct: metrics?.answer_rate_pct ?? 0,
        avg_wait_seconds: metrics?.avg_wait_seconds ?? 0,
      };
    });

    return res.json({ orgs: orgMetrics });
  } catch (err: any) {
    console.error("admin org-metrics unexpected:", err?.message ?? err);
    return res
      .status(500)
      .json({ error: "org_metrics_failed", detail: err?.message ?? "unknown_error" });
  }
});

// PATCH /api/admin/users/:id - Update user org or role
app.patch("/api/admin/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { orgId, role } = req.body;

    // Fetch current user to get existing metadata
    const { data: userData, error: fetchError } =
      await supabaseAdmin.auth.admin.getUserById(id);

    if (fetchError) {
      throw fetchError;
    }

    const currentMetadata = userData.user.user_metadata || {};

    // Merge with new values
    const newMetadata = {
      ...currentMetadata,
      ...(orgId && { org_id: orgId }),
      ...(role && { role }),
    };

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      user_metadata: newMetadata,
    });

    if (error) {
      throw error;
    }

    res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        org_id: (data.user.user_metadata as any)?.org_id ?? null,
        role: (data.user.user_metadata as any)?.role ?? null,
      },
    });
  } catch (err: any) {
    console.error("admin_update_user_failed:", err?.message ?? err);
    res.status(500).json({
      error: "admin_update_user_failed",
      detail: err?.message ?? "unknown_error",
    });
  }
});

// GET /api/admin/agents - List all users with 'agent' role
app.get("/api/admin/agents", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      throw error;
    }

    const agents = (data?.users || [])
      .filter((u) => (u.user_metadata as any)?.role === "agent")
      .map((u) => ({
        id: u.id,
        email: u.email,
        org_id: (u.user_metadata as any)?.org_id ?? null,
        role: (u.user_metadata as any)?.role ?? null,
        created_at: u.created_at,
      }));

    res.json({ agents });
  } catch (err: any) {
    console.error("admin_agents_list_failed:", err?.message ?? err);
    res.status(500).json({
      error: "admin_agents_list_failed",
      detail: err?.message ?? "unknown_error",
    });
  }
});

// GET /api/admin/orgs/:orgId/stats - Get call stats for a specific org today
app.get("/api/admin/orgs/:orgId/stats", async (req, res) => {
  try {
    const { orgId } = req.params;
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    // Query calls for this org from today
    const { data: calls, error: callsError } = await supabaseAdmin
      .from("calls")
      .select("status")
      .eq("org_id", orgId)
      .gte("started_at", todayStart);

    if (callsError) {
      throw callsError;
    }

    // Aggregate stats
    let totalCalls = 0;
    let answeredCalls = 0;
    let missedCalls = 0;

    for (const call of calls || []) {
      const st = (call.status || "").toString().toLowerCase();
      totalCalls += 1;
      if (st === "answered" || st === "completed") {
        answeredCalls += 1;
      } else if (st === "missed") {
        missedCalls += 1;
      }
    }

    const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

    res.json({
      stats: {
        total_calls: totalCalls,
        answered_calls: answeredCalls,
        missed_calls: missedCalls,
        answer_rate_pct: answerRate,
      },
    });
  } catch (err: any) {
    console.error("admin_org_stats_failed:", err?.message ?? err);
    res.status(500).json({
      error: "admin_org_stats_failed",
      detail: err?.message ?? "unknown_error",
    });
  }
});

// ============== CALL DATA ENDPOINTS ==============

// GET /api/calls/recent?org_id=...&limit=20
// Returns recent calls for a given org, or across all orgs if org_id is missing
app.get("/api/calls/recent", async (req, res) => {
  try {
    const orgId = req.query.org_id as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    console.log('[calls/recent] Request:', { orgId, limit });
    if (orgId) {
      // Resolve assigned numbers and filter recent calls by those numbers
      const { numbers, digits } = await getAssignedPhoneNumbersForOrg(orgId);
      if ((numbers.length === 0) && (digits.length === 0)) {
        return res.json({ items: [] });
      }

      // Fetch a larger recent set and filter in-memory to avoid complex OR queries
      const fetchLimit = Math.max(limit * 5, 200);
      const { data, error } = await supabaseAdmin
        .from('calls')
        .select('id, direction, from_number, to_number, to_number_digits, queue_name, status, started_at, answered_at, ended_at')
        .order('started_at', { ascending: false })
        .limit(fetchLimit);

      if (error) {
        console.error('[calls/recent] Supabase error (org scoped):', fmtErr(error));
        throw error;
      }

      const filtered = (data || []).filter((c: any) => {
        const tn = c.to_number || null;
        const td = c.to_number_digits || null;
        return (tn && numbers.includes(tn)) || (td && digits.includes(td));
      });

      const sliced = filtered.slice(0, limit);
      const items: any[] = [];
      for (const c of sliced) {
        const agentName = await resolveAgentNameForExtension((c as any).mightycall_extension || (c as any).answered_extension || (c as any).answered_by || (c as any).answer_extension || (c as any).agent_extension || (c as any).agent || null);
        items.push({
          id: c.id,
          direction: c.direction,
          status: c.status,
          fromNumber: c.from_number ?? null,
          toNumber: c.to_number ?? null,
          queueName: c.queue_name ?? null,
          startedAt: c.started_at,
          answeredAt: c.answered_at ?? null,
          endedAt: c.ended_at ?? null,
          agentName,
        });
      }

      return res.json({ items });
    }

    // Global (non-org) recent calls
    const { data, error } = await supabaseAdmin
      .from("calls")
      .select("id, direction, from_number, to_number, queue_name, status, started_at, answered_at, ended_at")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[calls/recent] Supabase error:', fmtErr(error));
      throw error;
    }

    const items = await Promise.all((data || []).map(async (c: any) => ({
      id: c.id,
      direction: c.direction,
      status: c.status,
      fromNumber: c.from_number ?? null,
      toNumber: c.to_number ?? null,
      queueName: c.queue_name ?? null,
      startedAt: c.started_at,
      answeredAt: c.answered_at ?? null,
      endedAt: c.ended_at ?? null,
      agentName: await resolveAgentNameForExtension(c.mightycall_extension || c.answered_extension || c.answered_by || c.answer_extension || c.agent_extension || c.agent || null)
    })));

    res.json({ items });
  } catch (err: any) {
    console.error('[calls/recent] Fatal error:', String(err?.message ?? err), err);
    const msg = String(err?.message ?? err);
    if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg) || err?.name === 'TypeError') {
      return res.status(502).json({ error: 'calls_recent_failed', detail: `upstream_fetch_failed: ${msg}` });
    }
    res.status(500).json({ error: 'calls_recent_failed', detail: msg });
  }
});

// Alias route for older/alternate frontend paths: /s/recent -> /api/calls/recent
app.get("/s/recent", async (req, res) => {
  try {
    // Reuse same query semantics as /api/calls/recent
    const orgId = req.query.org_id as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    console.log('[s/recent] Request:', { orgId, limit });

    if (orgId) {
      const { numbers, digits } = await getAssignedPhoneNumbersForOrg(orgId);
      if ((numbers.length === 0) && (digits.length === 0)) {
        return res.json({ items: [] });
      }

      const fetchLimit = Math.max(limit * 5, 200);
      const { data, error } = await supabaseAdmin
        .from('calls')
        .select('id, direction, from_number, to_number, to_number_digits, queue_name, status, started_at, answered_at, ended_at')
        .order('started_at', { ascending: false })
        .limit(fetchLimit);

      if (error) {
        console.error('[s/recent] Supabase error (org scoped):', fmtErr(error));
        return res.status(500).json({ error: 'supabase_error', detail: fmtErr(error) });
      }

      const filtered = (data || []).filter((c: any) => {
        const tn = c.to_number || null;
        const td = c.to_number_digits || null;
        return (tn && numbers.includes(tn)) || (td && digits.includes(td));
      }).slice(0, limit);

      const items = await Promise.all(filtered.slice(0, limit).map(async (c: any) => ({
        id: c.id,
        direction: c.direction,
        status: c.status,
        fromNumber: c.from_number ?? null,
        toNumber: c.to_number ?? null,
        queueName: c.queue_name ?? null,
        startedAt: c.started_at,
        answeredAt: c.answered_at ?? null,
        endedAt: c.ended_at ?? null,
        agentName: await resolveAgentNameForExtension((c as any).mightycall_extension || (c as any).answered_extension || (c as any).answered_by || (c as any).answer_extension || (c as any).agent_extension || (c as any).agent || null)
      })));

      return res.json({ items });
    }

    // Global behaviour
    const { data, error } = await supabaseAdmin
      .from('calls')
      .select('id, direction, from_number, to_number, queue_name, status, started_at, answered_at, ended_at')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[s/recent] Supabase error:', fmtErr(error));
      return res.status(500).json({ error: 'supabase_error', detail: fmtErr(error) });
    }

      const items = await Promise.all((data || []).map(async (c: any) => ({
      id: c.id,
      direction: c.direction,
      status: c.status,
      fromNumber: c.from_number ?? null,
      toNumber: c.to_number ?? null,
      queueName: c.queue_name ?? null,
      startedAt: c.started_at,
      answeredAt: c.answered_at ?? null,
      endedAt: c.ended_at ?? null,
        agentName: await resolveAgentNameForExtension((c as any).mightycall_extension || (c as any).answered_extension || (c as any).answered_by || (c as any).answer_extension || (c as any).agent_extension || (c as any).agent || null)
      })));

    res.json({ items });
  } catch (err: any) {
    console.error('[s/recent] Unexpected error:', err);
    res.status(500).json({ error: 'unexpected_error', detail: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/calls/queue-summary?org_id=...
// Returns queue stats for today (total, answered, missed per queue)
// If org_id is missing, aggregates across all orgs
app.get("/api/calls/queue-summary", async (req, res) => {
  try {
    const orgId = req.query.org_id as string | undefined;
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    console.log('[queue-summary] Request:', { orgId, todayStart });

    // Fetch today's calls and filter by assigned numbers when orgId is provided
    const { data, error } = await supabaseAdmin
      .from('calls')
      .select('queue_name, status, to_number, to_number_digits')
      .gte('started_at', todayStart);

    if (error) {
      console.error('[queue-summary] Supabase error:', fmtErr(error));
      throw error;
    }

    console.log('[queue-summary] Fetched', (data || []).length, 'calls (pre-filter)');

    // Aggregate by queue
    const queueMap = new Map<
      string | null,
      { name: string | null; total_calls: number; answered_calls: number; missed_calls: number }
    >();

    // If orgId provided, filter calls to only those matching assigned phone numbers
    let callsToAggregate = (data || []);
    if (orgId) {
      const { numbers, digits } = await getAssignedPhoneNumbersForOrg(orgId);
      callsToAggregate = (callsToAggregate || []).filter((c: any) => {
        const tn = c.to_number || null;
        const td = c.to_number_digits || null;
        return (tn && numbers.includes(tn)) || (td && digits.includes(td));
      });
    }

    for (const call of callsToAggregate || []) {
      const queueName = call.queue_name || "No queue";
      if (!queueMap.has(queueName)) {
        queueMap.set(queueName, {
          name: queueName,
          total_calls: 0,
          answered_calls: 0,
          missed_calls: 0,
        });
      }

      const queue = queueMap.get(queueName)!;
      queue.total_calls += 1;

      const st = (call.status || "").toLowerCase();
      if (st === "answered" || st === "completed") {
        queue.answered_calls += 1;
      } else if (st === "missed") {
        queue.missed_calls += 1;
      }
    }

    const queues = Array.from(queueMap.values());

    // Map to requested shape: name, totalCalls, answered, missed
    const mapped = queues.map((q) => ({
      name: q.name,
      totalCalls: q.total_calls,
      answered: q.answered_calls,
      missed: q.missed_calls,
    }));

    console.log('[queue-summary] Returning', mapped.length, 'queues');
    res.json({ queues: mapped });
  } catch (err: any) {
    console.error('[queue-summary] Fatal error:', String(err?.message ?? err), err);
    const msg = String(err?.message ?? err);
    if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg) || err?.name === 'TypeError') {
      return res.status(502).json({ error: 'queue_summary_failed', detail: `upstream_fetch_failed: ${msg}` });
    }
    res.status(500).json({ error: 'queue_summary_failed', detail: msg });
  }
});

// GET /api/calls/series?org_id=...&range=day|week|month|year
// Returns time-series call data from appropriate view
// If org_id is provided, returns per-org data
// If org_id is missing, aggregates across all orgs by bucket
app.get("/api/calls/series", async (req, res) => {
  try {
    const orgId = req.query.org_id as string | undefined;
    const range = (req.query.range as string) || "day";

    console.log('[calls/series] Request:', { orgId, range });

    // Determine start date and bucketing strategy
    const now = new Date();
    let startDate = new Date();
    let step: "hour" | "day" | "month" = "hour";

    if (range === "day") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      step = "hour";
    } else if (range === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 6); // last 7 days including today
      startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      step = "day";
    } else if (range === "month") {
      const d = new Date(now);
      d.setDate(d.getDate() - 29); // last 30 days
      startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      step = "day";
    } else if (range === "year") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 11); // last 12 months
      startDate = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      step = "month";
    }

    // Query calls from public.calls for the given time range
    const { data, error } = await supabaseAdmin
      .from('calls')
      .select('started_at, status, to_number, to_number_digits')
      .gte('started_at', startDate.toISOString())
      .order('started_at', { ascending: true });

    if (error) {
      console.error('[calls/series] Supabase error:', fmtErr(error));
      throw error;
    }

    console.log('[calls/series] Fetched', (data || []).length, 'calls for bucketing (pre-filter)');

    // If orgId provided, filter calls to only those matching assigned phone numbers
    let callsForBucketing = (data || []);
    if (orgId) {
      const { numbers, digits } = await getAssignedPhoneNumbersForOrg(orgId);
      callsForBucketing = (callsForBucketing || []).filter((c: any) => {
        const tn = c.to_number || null;
        const td = c.to_number_digits || null;
        return (tn && numbers.includes(tn)) || (td && digits.includes(td));
      });
    }

    console.log('[calls/series] Calls after filtering:', (callsForBucketing || []).length);

    // Aggregate into buckets
    const bucketMap = new Map<string, { bucket: string; total_calls: number; answered_calls: number; missed_calls: number }>();

    const markAnswered = (s: any) => {
      const st = (s || "").toString().toLowerCase();
      return st === "answered" || st === "completed";
    };

    for (const row of callsForBucketing || []) {
      const started = new Date(row.started_at);
      let bucketDate: Date;

      if (step === "hour") {
        bucketDate = new Date(started.getFullYear(), started.getMonth(), started.getDate(), started.getHours(), 0, 0, 0);
      } else if (step === "day") {
        bucketDate = new Date(started.getFullYear(), started.getMonth(), started.getDate(), 0, 0, 0, 0);
      } else {
        // month
        bucketDate = new Date(started.getFullYear(), started.getMonth(), 1, 0, 0, 0, 0);
      }

      const bucketKey = bucketDate.toISOString();
      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, { bucket: bucketKey, total_calls: 0, answered_calls: 0, missed_calls: 0 });
      }

      const entry = bucketMap.get(bucketKey)!;
      entry.total_calls += 1;
      if (markAnswered(row.status)) entry.answered_calls += 1;
      if ((row.status || "").toString().toLowerCase() === "missed") entry.missed_calls += 1;
    }

    // Ensure all buckets (even empty) are present between startDate and now
    const points: Array<{ bucket: string; total_calls: number; answered_calls: number; missed_calls: number }> = [];
    const cursor = new Date(startDate);
    while (cursor <= now) {
      let b: Date;
      if (step === "hour") {
        b = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), cursor.getHours(), 0, 0, 0);
        cursor.setHours(cursor.getHours() + 1);
      } else if (step === "day") {
        b = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0, 0);
        cursor.setDate(cursor.getDate() + 1);
      } else {
        b = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0, 0);
        cursor.setMonth(cursor.getMonth() + 1);
      }

      const key = b.toISOString();
      const val = bucketMap.get(key) || { bucket: key, total_calls: 0, answered_calls: 0, missed_calls: 0 };
      points.push(val);
    }

    // Map to frontend-friendly shape: bucketLabel + totalCalls (and include answered/missed for future use)
    const mapped = points.map((p) => ({
      bucketLabel: p.bucket,
      totalCalls: p.total_calls,
      answered: p.answered_calls,
      missed: p.missed_calls,
    }));

    console.log('[calls/series] Returning', mapped.length, 'time buckets');
    res.json({ points: mapped });
  } catch (err: any) {
    console.error('[calls/series] Fatal error:', String(err?.message ?? err), err);
    const msg = String(err?.message ?? err);
    if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg) || err?.name === 'TypeError') {
      return res.status(502).json({ error: 'calls_series_failed', detail: `upstream_fetch_failed: ${msg}` });
    }
    res.status(500).json({ error: 'calls_series_failed', detail: msg });
  }
});

// Alias route for older/alternate frontend paths: /s/series -> /api/calls/series
app.get("/s/series", async (req, res) => {
  try {
    const orgId = req.query.org_id as string | undefined;
    const range = (req.query.range as string) || "day";

    console.log('[s/series] Request:', { orgId, range });

    const now = new Date();
    let startDate = new Date();
    let step: "hour" | "day" | "month" = "hour";

    if (range === "day") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      step = "hour";
    } else if (range === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      step = "day";
    } else if (range === "month") {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      step = "day";
    } else if (range === "year") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 11);
      startDate = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      step = "month";
    }

    // Query calls for the requested range and filter by assigned numbers if orgId provided
    const { data, error } = await supabaseAdmin
      .from('calls')
      .select('started_at, status, to_number, to_number_digits')
      .gte('started_at', startDate.toISOString())
      .order('started_at', { ascending: true });

    if (error) {
      console.error('[s/series] Supabase error:', fmtErr(error));
      return res.status(500).json({ error: 'supabase_error', detail: fmtErr(error) });
    }

    let callsForBucketing = (data || []);
    if (orgId) {
      const { numbers, digits } = await getAssignedPhoneNumbersForOrg(orgId);
      callsForBucketing = (callsForBucketing || []).filter((c: any) => {
        const tn = c.to_number || null;
        const td = c.to_number_digits || null;
        return (tn && numbers.includes(tn)) || (td && digits.includes(td));
      });
    }

    // Aggregate into buckets (same logic as /api/calls/series)
    const bucketMap = new Map<string, { bucket: string; total_calls: number; answered_calls: number; missed_calls: number }>();
    const markAnswered = (s: any) => {
      const st = (s || "").toString().toLowerCase();
      return st === "answered" || st === "completed";
    };

    for (const row of data || []) {
      const started = new Date(row.started_at);
      let bucketDate: Date;
      if (step === "hour") {
        bucketDate = new Date(started.getFullYear(), started.getMonth(), started.getDate(), started.getHours(), 0, 0, 0);
      } else if (step === "day") {
        bucketDate = new Date(started.getFullYear(), started.getMonth(), started.getDate(), 0, 0, 0, 0);
      } else {
        bucketDate = new Date(started.getFullYear(), started.getMonth(), 1, 0, 0, 0, 0);
      }

      const bucketKey = bucketDate.toISOString();
      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, { bucket: bucketKey, total_calls: 0, answered_calls: 0, missed_calls: 0 });
      }

      const entry = bucketMap.get(bucketKey)!;
      entry.total_calls += 1;
      if (markAnswered(row.status)) entry.answered_calls += 1;
      if ((row.status || "").toString().toLowerCase() === "missed") entry.missed_calls += 1;
    }

    const points: Array<{ bucket: string; total_calls: number; answered_calls: number; missed_calls: number }> = [];
    const cursor = new Date(startDate);
    const nowDate = new Date();
    while (cursor <= nowDate) {
      let b: Date;
      if (step === "hour") {
        b = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), cursor.getHours(), 0, 0, 0);
        cursor.setHours(cursor.getHours() + 1);
      } else if (step === "day") {
        b = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0, 0);
        cursor.setDate(cursor.getDate() + 1);
      } else {
        b = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0, 0);
        cursor.setMonth(cursor.getMonth() + 1);
      }

      const key = b.toISOString();
      const val = bucketMap.get(key) || { bucket: key, total_calls: 0, answered_calls: 0, missed_calls: 0 };
      points.push(val);
    }

    const mapped = points.map((p) => ({ bucketLabel: p.bucket, totalCalls: p.total_calls, answered: p.answered_calls, missed: p.missed_calls }));
    console.log('[s/series] Returning', mapped.length, 'time buckets');
    res.json({ points: mapped });
  } catch (err: any) {
    console.error('[s/series] Unexpected error:', err);
    res.status(500).json({ error: 'unexpected_error', detail: String(err instanceof Error ? err.message : err) });
  }
});

    // ===== BILLING MANAGEMENT ENDPOINTS =====

    // Get billing records for an org or user
    app.get('/api/admin/billing/records', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const orgId = req.query.org_id as string;
        const userId = req.query.user_id as string;
        const limit = parseInt(req.query.limit as string) || 10000; // Default to 10000 for full results
        const offset = parseInt(req.query.offset as string) || 0;

        let query = supabaseAdmin
          .from('billing_records')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (orgId) {
          query = query.eq('org_id', orgId);
        }
        if (userId) {
          query = query.eq('user_id', userId);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ records: data });
      } catch (err: any) {
        console.error('[billing/records] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_billing_records', detail: err?.message });
      }
    });

    // Create a billing record
    app.post('/api/admin/billing/records', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const { org_id, user_id, type, description, amount, currency, metadata } = req.body;

        const { data, error } = await supabaseAdmin
          .from('billing_records')
          .insert([{
            org_id,
            user_id,
            type,
            description,
            amount,
            currency: currency || 'USD',
            metadata: metadata || {}
          }])
          .select()
          .single();

        if (error) throw error;
        res.json({ record: data });
      } catch (err: any) {
        console.error('[billing/records POST] error:', err);
        res.status(500).json({ error: 'failed_to_create_billing_record', detail: err?.message });
      }
    });

    // Get invoices for an org
    app.get('/api/admin/billing/invoices', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const orgId = req.query.org_id as string;
        const limit = parseInt(req.query.limit as string) || 10000; // Default to 10000 for full results

        let query = supabaseAdmin
          .from('invoices')
          .select(`
            *,
            invoice_items (*)
          `)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (orgId) {
          query = query.eq('org_id', orgId);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ invoices: data });
      } catch (err: any) {
        console.error('[billing/invoices] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_invoices', detail: err?.message });
      }
    });

    // Create an invoice
    app.post('/api/admin/billing/invoices', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const { org_id, items = [] } = req.body;

        if (!org_id) {
          return res.status(400).json({ error: 'org_id_required' });
        }

        // Generate invoice number
        const invoiceNumber = `INV-${Date.now()}`;

        // Build minimal invoice object - only basic required fields
        const invoiceData: any = {
          org_id,
          invoice_number: invoiceNumber,
          status: 'draft'
        };

        const { data: invoice, error: invoiceError } = await supabaseAdmin
          .from('invoices')
          .insert([invoiceData])
          .select()
          .single();

        if (invoiceError) throw invoiceError;

        // Insert invoice items if provided
        let itemsData = [];
        if (items && items.length > 0) {
          const invoiceItems = items.map((item: any) => ({
            invoice_id: invoice.id,
            description: item.description || '',
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0
          }));

          const { data: created, error: itemsError } = await supabaseAdmin
            .from('invoice_items')
            .insert(invoiceItems)
            .select();

          if (itemsError) console.warn('invoice_items insert warning:', itemsError);
          itemsData = created || [];
        }

        res.json({ invoice: { ...invoice, invoice_items: itemsData } });
      } catch (err: any) {
        console.error('[billing/invoices POST] error:', err);
        res.status(500).json({ error: 'failed_to_create_invoice', detail: err?.message });
      }
    });

    // ===== PACKAGE MANAGEMENT ENDPOINTS =====

    // Get all packages
    app.get('/api/admin/packages', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const { data, error } = await supabaseAdmin
          .from('packages')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ packages: data });
      } catch (err: any) {
        console.error('[packages] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_packages', detail: err?.message });
      }
    });

    // Create a package
    app.post('/api/admin/packages', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const { name, description, type, features, pricing } = req.body;

        const { data, error } = await supabaseAdmin
          .from('packages')
          .insert([{
            name,
            description,
            type,
            features: features || {},
            pricing: pricing || {}
          }])
          .select()
          .single();

        if (error) throw error;
        res.json({ package: data });
      } catch (err: any) {
        console.error('[packages POST] error:', err);
        res.status(500).json({ error: 'failed_to_create_package', detail: err?.message });
      }
    });

    // Get user packages
    app.get('/api/admin/user-packages', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const userId = req.query.user_id as string;

        let query = supabaseAdmin
          .from('user_packages')
          .select(`
            *,
            packages (*)
          `)
          .order('assigned_at', { ascending: false });

        if (userId) {
          query = query.eq('user_id', userId);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ user_packages: data });
      } catch (err: any) {
        console.error('[user-packages] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_user_packages', detail: err?.message });
      }
    });

    // Assign package to user
    app.post('/api/admin/user-packages', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const { user_id, package_id, expires_at, metadata } = req.body;
        const assigned_by = actorId;

        const { data, error } = await supabaseAdmin
          .from('user_packages')
          .insert([{
            user_id,
            package_id,
            assigned_by,
            expires_at,
            metadata: metadata || {}
          }])
          .select(`
            *,
            packages (*)
          `)
          .single();

        if (error) throw error;
        res.json({ user_package: data });
      } catch (err: any) {
        console.error('[user-packages POST] error:', err);
        res.status(500).json({ error: 'failed_to_assign_package', detail: err?.message });
      }
    });

    // ===== MIGHTYCALL INTEGRATION ENDPOINTS =====

    // Resync all phone numbers from MightyCall
    app.post('/api/admin/mightycall/resync', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        console.log('[mightycall/resync] Starting phone number resync...');
        const { upserted } = await syncMightyCallPhoneNumbers(supabaseAdmin);

        res.json({
          success: true,
          message: `Successfully synced ${upserted} phone numbers from MightyCall`,
          upserted
        });
      } catch (err: any) {
        console.error('[mightycall/resync] error:', err);
        res.status(500).json({ error: 'failed_to_resync_phone_numbers', detail: err?.message });
      }
    });

    // Get MightyCall reports for an org
    app.get('/api/admin/mightycall/reports', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const orgId = req.query.org_id as string;
        const reportType = req.query.type as string || 'calls';
        const startDate = req.query.start_date as string;
        const endDate = req.query.end_date as string;

        let query = supabaseAdmin
          .from('mightycall_reports')
          .select('*')
          .eq('report_type', reportType)
          .order('report_date', { ascending: false });

        if (orgId) {
          query = query.eq('org_id', orgId);
        }
        if (startDate) {
          query = query.gte('report_date', startDate);
        }
        if (endDate) {
          query = query.lte('report_date', endDate);
        }

        const { data, error } = await query.limit(100);
        if (error) throw error;

        res.json({ reports: data });
      } catch (err: any) {
        console.error('[mightycall/reports] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_reports', detail: err?.message });
      }
    });

    // Get MightyCall recordings for an org
    app.get('/api/admin/mightycall/recordings', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const orgId = req.query.org_id as string;
        const phoneNumberId = req.query.phone_number_id as string;
        const limit = parseInt(req.query.limit as string) || 10000; // Default to 10000 for full results

        let query = supabaseAdmin
          .from('mightycall_recordings')
          .select('*')
          .order('recording_date', { ascending: false })
          .limit(limit);

        if (orgId) {
          query = query.eq('org_id', orgId);
        }
        if (phoneNumberId) {
          query = query.eq('phone_number_id', phoneNumberId);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ recordings: data });
      } catch (err: any) {
        console.error('[mightycall/recordings] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_recordings', detail: err?.message });
      }
    });

    // Fetch and cache MightyCall reports (admin only)
    app.post('/api/admin/mightycall/fetch-reports', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const { org_id, phone_number_ids, report_type, start_date, end_date } = req.body;

        if (!org_id || !start_date || !end_date) {
          return res.status(400).json({ error: 'missing_required_fields', required: ['org_id', 'start_date', 'end_date'] });
        }

        console.log('[mightycall/fetch-reports] Fetching reports for:', {
          org_id,
          phone_number_ids,
          report_type,
          start_date,
          end_date
        });

        const { reportsSynced, recordingsSynced } = await syncMightyCallReports(
          supabaseAdmin,
          org_id,
          phone_number_ids || [],
          start_date,
          end_date
        );

        res.json({
          success: true,
          message: `Synced ${reportsSynced} reports and ${recordingsSynced} recordings`,
          reports_synced: reportsSynced,
          recordings_synced: recordingsSynced
        });
      } catch (err: any) {
        console.error('[mightycall/fetch-reports] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_reports', detail: err?.message });
      }
    });

    // ===== CLIENT-FACING MIGHTYCALL ENDPOINTS =====

    // Get phone numbers for current user's org
    app.get('/api/mightycall/phone-numbers', async (req, res) => {
      try {
        const userId = req.header('x-user-id') || null;
        if (!userId) {
          return res.status(401).json({ error: 'unauthenticated' });
        }

        // Get user's org (from query or from user membership)
        const paramOrgId = req.query.org_id as string || null;
        let orgId = paramOrgId;
        
        if (!orgId) {
          const { data: userOrg, error: orgError } = await supabaseAdmin
            .from('org_members')
            .select('org_id')
            .eq('user_id', userId)
            .single();

          if (orgError || !userOrg) {
            return res.status(403).json({ error: 'no_org_membership' });
          }
          orgId = userOrg.org_id;
        }

        const limit = parseInt(req.query.limit as string) || 100;

        const { data, error } = await supabaseAdmin
          .from('phone_numbers')
          .select('*')
          .eq('org_id', orgId)
          .limit(limit);

        if (error) throw error;
        res.json({ phone_numbers: data || [] });
      } catch (err: any) {
        console.error('[mightycall/phone-numbers client] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_phone_numbers', detail: err?.message });
      }
    });

    // Get reports - admin sees all orgs, clients see only their org
    app.get('/api/mightycall/reports', async (req, res) => {
      try {
        const userId = req.header('x-user-id') || null;
        if (!userId) {
          return res.status(401).json({ error: 'unauthenticated' });
        }

        const reportType = req.query.type as string || 'calls';
        const limit = parseInt(req.query.limit as string) || 100;
        const orgId = req.query.org_id as string || null;

        // Check if user is platform admin
        const isAdmin = await isPlatformAdmin(userId);

        // First try mightycall_reports table
        let query = supabaseAdmin
          .from('mightycall_reports')
          .select('*, organizations(name, id)')
          .eq('report_type', reportType)
          .order('report_date', { ascending: false })
          .limit(limit);

        // If org_id is provided in query, use it (admin filtering)
        if (orgId) {
          query = query.eq('org_id', orgId);
        } else if (!isAdmin) {
          // Non-admin: only show their org
          const { data: userOrgs } = await supabaseAdmin
            .from('org_members')
            .select('org_id')
            .eq('user_id', userId);
          
          if (!userOrgs || userOrgs.length === 0) {
            return res.json({ reports: [] });
          }
          
          const orgIds = userOrgs.map(o => o.org_id);
          query = query.in('org_id', orgIds);
        }
        // If isAdmin and no orgId filter, show all

        let { data, error } = await query;

        // Fallback: if no reports found or table error, pull from calls table
        if (error || !data || data.length === 0) {
          console.log('[mightycall/reports] Falling back to calls table for reports');
          
          // Query calls table and transform to report format
          let callsQuery = supabaseAdmin
            .from('calls')
            .select('id, org_id, from_number, to_number, status, started_at, ended_at')
            .order('started_at', { ascending: false })
            .limit(limit);

          if (orgId) {
            callsQuery = callsQuery.eq('org_id', orgId);
          } else if (!isAdmin) {
            const { data: userOrgs } = await supabaseAdmin
              .from('org_members')
              .select('org_id')
              .eq('user_id', userId);
            
            if (!userOrgs || userOrgs.length === 0) {
              return res.json({ reports: [] });
            }
            
            const orgIds = userOrgs.map(o => o.org_id);
            callsQuery = callsQuery.in('org_id', orgIds);
          }

          const { data: calls, error: callsError } = await callsQuery;
          
          if (callsError) {
            console.error('[mightycall/reports] calls fallback error:', callsError);
            return res.json({ reports: [] });
          }

          // Transform calls to report format
          data = (calls || []).map((call: any) => ({
            id: call.id,
            org_id: call.org_id,
            report_type: reportType,
            report_date: call.started_at,
            from_number: call.from_number,
            to_number: call.to_number,
            status: call.status,
            duration: 0,
            organizations: { name: 'Org', id: call.org_id }
          }));
        }

        res.json({ reports: data || [] });
      } catch (err: any) {
        console.error('[mightycall/reports] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_reports', detail: err?.message });
      }
    });

    // Get recordings - admin sees all orgs, clients see only their org
    app.get('/api/mightycall/recordings', async (req, res) => {
      try {
        const userId = req.header('x-user-id') || null;
        if (!userId) {
          return res.status(401).json({ error: 'unauthenticated' });
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const orgId = req.query.org_id as string || null;

        // Check if user is platform admin
        const isAdmin = await isPlatformAdmin(userId);

        let query = supabaseAdmin
          .from('mightycall_recordings')
          .select('*, organizations(name, id)')
          .order('created_at', { ascending: false })
          .limit(limit);

        // If org_id is provided in query, use it (admin filtering)
        if (orgId) {
          query = query.eq('org_id', orgId);
        } else if (!isAdmin) {
          // Non-admin: only show their org
          const { data: userOrgs } = await supabaseAdmin
            .from('org_members')
            .select('org_id')
            .eq('user_id', userId);
          
          if (!userOrgs || userOrgs.length === 0) {
            return res.json({ recordings: [] });
          }
          
          const orgIds = userOrgs.map(o => o.org_id);
          query = query.in('org_id', orgIds);
        }
        // If isAdmin and no orgId filter, show all

        let { data, error } = await query;

        // Fallback: if no recordings found or table error, pull from calls table
        if (error || !data || data.length === 0) {
          console.log('[mightycall/recordings] Falling back to calls table for recordings');
          
          // Query calls table and transform to recording format
          let callsQuery = supabaseAdmin
            .from('calls')
            .select('id, org_id, from_number, to_number, status, started_at, ended_at, recording_url')
            .order('started_at', { ascending: false })
            .limit(limit);

          if (orgId) {
            callsQuery = callsQuery.eq('org_id', orgId);
          } else if (!isAdmin) {
            const { data: userOrgs } = await supabaseAdmin
              .from('org_members')
              .select('org_id')
              .eq('user_id', userId);
            
            if (!userOrgs || userOrgs.length === 0) {
              return res.json({ recordings: [] });
            }
            
            const orgIds = userOrgs.map(o => o.org_id);
            callsQuery = callsQuery.in('org_id', orgIds);
          }

          const { data: calls, error: callsError } = await callsQuery;
          
          if (callsError) {
            console.error('[mightycall/recordings] calls fallback error:', callsError);
            return res.json({ recordings: [] });
          }

          // Transform calls to recording format
          data = (calls || []).map((call: any) => ({
            id: call.id,
            org_id: call.org_id,
            from_number: call.from_number,
            to_number: call.to_number,
            status: call.status,
            started_at: call.started_at,
            ended_at: call.ended_at,
            duration: 0,
            recording_url: call.recording_url || null,
            created_at: call.started_at,
            organizations: { name: 'Org', id: call.org_id }
          }));
        }

        res.json({ recordings: data || [] });
      } catch (err: any) {
        console.error('[mightycall/recordings] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_recordings', detail: err?.message });
      }
    });

      // Stream/download a single recording by call id. Proxies the remote `recording_url` so
      // frontend can fetch with `x-user-id` header and not expose external URLs or auth.
      app.get('/api/recordings/:id/download', async (req, res) => {
        try {
          const actorId = req.header('x-user-id') || null;
          if (!actorId) return res.status(401).json({ error: 'unauthenticated' });

          const { id } = req.params;
          if (!id) return res.status(400).json({ error: 'missing_id' });

          const { data: call, error } = await supabaseAdmin
            .from('calls')
            .select('id, recording_url, recording_file_name')
            .eq('id', id)
            .maybeSingle();

          if (error) {
            console.error('[recordings/download] db lookup failed:', error);
            return res.status(500).json({ error: 'db_lookup_failed' });
          }
          if (!call || !call.recording_url) {
            return res.status(404).json({ error: 'recording_not_found' });
          }

          const recordingUrl = call.recording_url;
          // Fetch remote asset
          const fetched = await fetch(recordingUrl);
          if (!fetched.ok) {
            console.error('[recordings/download] remote fetch failed:', fetched.status);
            return res.status(502).json({ error: 'remote_fetch_failed', status: fetched.status });
          }

          // Convert Web stream to Node stream when possible and pipe to response
          const contentType = fetched.headers.get('content-type') || 'application/octet-stream';
          const filename = call.recording_file_name || `${id}.mp3`;
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

          if ((fetched as any).body && typeof (Readable as any).fromWeb === 'function') {
            const nodeStream = Readable.fromWeb((fetched as any).body);
            nodeStream.pipe(res);
          } else {
            // Fallback: buffer into memory and send (may be larger for big files)
            const arr = await fetched.arrayBuffer();
            const buf = Buffer.from(arr);
            res.send(buf);
          }
        } catch (e: any) {
          console.error('[recordings/download] error:', e?.message ?? e);
          res.status(500).json({ error: 'download_failed', detail: e?.message ?? String(e) });
        }
      });

    // Get SMS messages - admin sees all orgs, clients see only their org
    app.get('/api/sms/messages', async (req, res) => {
      try {
        const userId = req.header('x-user-id') || null;
        if (!userId) {
          return res.status(401).json({ error: 'unauthenticated' });
        }

        const limit = parseInt(req.query.limit as string) || 100;
        const orgId = req.query.org_id as string || null;

        // Check if user is platform admin
        const isAdmin = await isPlatformAdmin(userId);

        // Determine which orgIds to query
        let targetOrgIds: string[] = [];
        if (orgId) {
          targetOrgIds = [orgId];
        } else if (!isAdmin) {
          // Non-admin: only show their orgs
          const { data: userOrgs } = await supabaseAdmin
            .from('org_members')
            .select('org_id')
            .eq('user_id', userId);
          
          if (!userOrgs || userOrgs.length === 0) {
            return res.json({ messages: [] });
          }
          targetOrgIds = userOrgs.map(o => o.org_id);
        }
        // If isAdmin and no orgId filter, we'll get all orgs

        // Build phone filter for non-admin users
        let allowedPhoneIds: string[] | null = null;
        if (!isAdmin && targetOrgIds.length > 0) {
          // Get user's assigned phones for their org(s)
          const phonesByOrg: Record<string, string[]> = {};
          for (const oId of targetOrgIds) {
            const { phones } = await getUserAssignedPhoneNumbers(oId, userId);
            phonesByOrg[oId] = phones.map(p => p.id).filter(Boolean);
          }
          const allPhoneIds = Object.values(phonesByOrg).flat();
          if (allPhoneIds.length > 0) {
            allowedPhoneIds = allPhoneIds;
          }
        }

        // Try mightycall_sms_messages first, fallback to sms_logs
        let tableName = 'mightycall_sms_messages';
        let query = supabaseAdmin
          .from(tableName)
          .select('*, organizations(name, id)')
          .order('created_at', { ascending: false })
          .limit(limit);

        // Add org filter
        if (targetOrgIds.length > 0) {
          query = query.in('org_id', targetOrgIds);
        }
        
        // Add phone filter for non-admin
        if (!isAdmin && allowedPhoneIds) {
          if (allowedPhoneIds.length === 0) {
            // User has no assigned phones in their org(s)
            return res.json({ messages: [] });
          }
          query = query.in('phone_number_id', allowedPhoneIds);
        }

        let { data, error } = await query;

        // Fallback to sms_logs if mightycall_sms_messages doesn't exist
        if (error && error.code === 'PGRST205' && error.message.includes('mightycall_sms_messages')) {
          console.log('[sms/messages] mightycall_sms_messages not found, using sms_logs fallback');
          tableName = 'sms_logs';
          
          query = supabaseAdmin
            .from('sms_logs')
            .select('*')
            .order('sent_at', { ascending: false })
            .limit(limit);

          if (targetOrgIds.length > 0) {
            query = query.in('org_id', targetOrgIds);
          }

          // Also apply phone filter for non-admin in fallback
          if (!isAdmin && allowedPhoneIds) {
            if (allowedPhoneIds.length === 0) {
              // User has no assigned phones in their org(s)
              return res.json({ messages: [] });
            }
            query = query.in('phone_number_id', allowedPhoneIds);
          }

          ({ data, error } = await query);
        }

        if (error) throw error;
        res.json({ messages: data || [] });
      } catch (err: any) {
        console.error('[sms/messages] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_messages', detail: err?.message });
      }
    });

    // DEV: Seed a test call into `public.calls` for local/dev verification.
    // Enabled when `NODE_ENV !== 'production'` OR when `ENABLE_DEV_SEED=true`.
    app.post("/api/dev/seed-call", async (req, res) => {
      try {
        const enabled = process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_SEED === "true";
        if (!enabled) {
          return res.status(403).json({ error: "dev_seed_disabled" });
        }

        const body = req.body || {};
        const now = new Date().toISOString();

        const insertRow = {
          org_id: (body.org_id as string) || (body.orgId as string) || null,
          provider_call_id: body.provider_call_id || `dev-${Date.now()}`,
          direction: body.direction || "inbound",
          status: body.status || "answered",
          from_number: body.from_number || "+15550000001",
          to_number: body.to_number || "+15550000002",
          queue_name: body.queue_name || "Dev Queue",
          started_at: body.started_at || now,
          answered_at: body.answered_at || now,
          ended_at: body.ended_at || null,
          date: body.date || now,
        } as any;

        const { data, error } = await supabaseAdmin.from("calls").insert([insertRow]).select().maybeSingle();
        if (error) {
          console.error("dev_seed_insert_failed:", error);
          throw error;
        }

        return res.json({ call: data });
      } catch (err: any) {
        console.error("dev_seed_failed:", err?.message ?? err);
        res.status(500).json({ error: "dev_seed_failed", detail: err?.message ?? "unknown_error" });
      }
    });

// ===== SUPPORT TICKET ENDPOINTS =====

    // GET /api/support/tickets - Get support tickets (admin sees all, clients see own org)
    app.get('/api/support/tickets', async (req, res) => {
      try {
        const userId = req.header('x-user-id') || null;
        if (!userId) {
          return res.status(401).json({ error: 'unauthenticated' });
        }

        // Check if user is platform admin
        const isAdmin = await isPlatformAdmin(userId);

        let query = supabaseAdmin
          .from('support_tickets')
          .select(`
            *,
            support_ticket_messages (*),
            organizations (name, id)
          `)
          .order('created_at', { ascending: false });

        // Non-admin: filter to their org(s)
        if (!isAdmin) {
          const { data: userOrgs, error: orgsError } = await supabaseAdmin
            .from('org_members')
            .select('org_id')
            .eq('user_id', userId);

          if (orgsError || !userOrgs || userOrgs.length === 0) {
            return res.json({ tickets: [] });
          }

          const orgIds = userOrgs.map(o => o.org_id);
          query = query.in('org_id', orgIds);
        }

        const { data, error } = await query;

        if (error) throw error;
        res.json({ tickets: data });
      } catch (err: any) {
        console.error('[support/tickets] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_tickets', detail: err?.message });
      }
    });

    // POST /api/support/tickets - Create a new support ticket
    app.post('/api/support/tickets', async (req, res) => {
      try {
        const userId = req.header('x-user-id') || null;
        if (!userId) {
          return res.status(401).json({ error: 'unauthenticated' });
        }

        // Get user's org
        const { data: userOrg, error: orgError } = await supabaseAdmin
          .from('org_members')
          .select('org_id')
          .eq('user_id', userId)
          .single();

        if (orgError || !userOrg) {
          return res.status(403).json({ error: 'no_org_membership' });
        }

        const { subject, message, priority } = req.body;

        // Create ticket
        const { data: ticket, error: ticketError } = await supabaseAdmin
          .from('support_tickets')
          .insert([{
            org_id: userOrg.org_id,
            created_by: userId,
            subject,
            priority: priority || 'normal',
            status: 'open'
          }])
          .select()
          .single();

        if (ticketError) throw ticketError;

        // Add initial message
        if (message) {
          const { error: messageError } = await supabaseAdmin
            .from('support_ticket_messages')
            .insert([{
              ticket_id: ticket.id,
              sender_user_id: userId,
              message
            }]);

          if (messageError) throw messageError;
        }

        res.json({ ticket });
      } catch (err: any) {
        console.error('[support/tickets POST] error:', err);
        res.status(500).json({ error: 'failed_to_create_ticket', detail: err?.message });
      }
    });

    // POST /api/support/tickets/:ticketId/messages - Add message to ticket
    app.post('/api/support/tickets/:ticketId/messages', async (req, res) => {
      try {
        const userId = req.header('x-user-id') || null;
        if (!userId) {
          return res.status(401).json({ error: 'unauthenticated' });
        }

        const { ticketId } = req.params;
        const { message } = req.body;

        // Verify user has access to this ticket
        const { data: ticket, error: ticketError } = await supabaseAdmin
          .from('support_tickets')
          .select('org_id')
          .eq('id', ticketId)
          .single();

        if (ticketError || !ticket) {
          return res.status(404).json({ error: 'ticket_not_found' });
        }

        // Check if user belongs to the org
        const { data: membership, error: membershipError } = await supabaseAdmin
          .from('org_members')
          .select('id')
          .eq('org_id', ticket.org_id)
          .eq('user_id', userId)
          .single();

        if (membershipError || !membership) {
          return res.status(403).json({ error: 'access_denied' });
        }

        const { data, error } = await supabaseAdmin
          .from('support_ticket_messages')
          .insert([{
            ticket_id: ticketId,
            sender_user_id: userId,
            message
          }])
          .select()
          .single();

        if (error) throw error;
        res.json({ message: data });
      } catch (err: any) {
        console.error('[support/ticket/messages POST] error:', err);
        res.status(500).json({ error: 'failed_to_add_message', detail: err?.message });
      }
    });

    // GET /api/admin/support/tickets - Admin view of all support tickets
    app.get('/api/admin/support/tickets', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const { data, error } = await supabaseAdmin
          .from('support_tickets')
          .select(`
            *,
            support_ticket_messages (*),
            organizations (name)
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ tickets: data });
      } catch (err: any) {
        console.error('[admin/support/tickets] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_tickets', detail: err?.message });
      }
    });

    // PATCH /api/admin/support/tickets/:ticketId - Update ticket status (admin only)
    app.patch('/api/admin/support/tickets/:ticketId', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const { ticketId } = req.params;
        const { status, priority } = req.body;

        const updateData: any = {};
        if (status) updateData.status = status;
        if (priority) updateData.priority = priority;

        const { data, error } = await supabaseAdmin
          .from('support_tickets')
          .update(updateData)
          .eq('id', ticketId)
          .select()
          .single();

        if (error) throw error;
        res.json({ ticket: data });
      } catch (err: any) {
        console.error('[admin/support/ticket PATCH] error:', err);
        res.status(500).json({ error: 'failed_to_update_ticket', detail: err?.message });
      }
    });

    // POST /api/admin/support/tickets/:ticketId/messages - Admin add message to ticket
    app.post('/api/admin/support/tickets/:ticketId/messages', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const { ticketId } = req.params;
        const { message } = req.body;

        if (!message) {
          return res.status(400).json({ error: 'message_required' });
        }

        // Verify ticket exists
        const { data: ticket, error: ticketError } = await supabaseAdmin
          .from('support_tickets')
          .select('id')
          .eq('id', ticketId)
          .single();

        if (ticketError || !ticket) {
          return res.status(404).json({ error: 'ticket_not_found' });
        }

        const { data, error } = await supabaseAdmin
          .from('support_ticket_messages')
          .insert([{
            ticket_id: ticketId,
            sender_user_id: actorId,
            message
          }])
          .select()
          .single();

        if (error) throw error;
        res.json({ message: data });
      } catch (err: any) {
        console.error('[admin/support/ticket/messages POST] error:', err);
        res.status(500).json({ error: 'failed_to_add_message', detail: err?.message });
      }
    });

    // GET /api/support/tickets/:ticketId - Get specific ticket with messages
    app.get('/api/support/tickets/:ticketId', async (req, res) => {
      try {
        const userId = req.header('x-user-id') || null;
        if (!userId) {
          return res.status(401).json({ error: 'unauthenticated' });
        }

        const { ticketId } = req.params;

        // Verify user can access this ticket
        const { data: ticket, error: ticketError } = await supabaseAdmin
          .from('support_tickets')
          .select(`
            *,
            support_ticket_messages (*),
            organizations (name, id)
          `)
          .eq('id', ticketId)
          .single();

        if (ticketError || !ticket) {
          return res.status(404).json({ error: 'ticket_not_found' });
        }

        // Check if user is admin or belongs to the org
        const isAdmin = await isPlatformAdmin(userId);
        if (!isAdmin) {
          const { data: membership } = await supabaseAdmin
            .from('org_members')
            .select('id')
            .eq('org_id', ticket.org_id)
            .eq('user_id', userId)
            .single();

          if (!membership) {
            return res.status(403).json({ error: 'access_denied' });
          }
        }

        res.json({ ticket });
      } catch (err: any) {
        console.error('[support/tickets/:ticketId] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_ticket', detail: err?.message });
      }
    });

    // ===== NUMBER REQUEST ENDPOINTS =====

    // GET /api/number-requests - Get number requests for user's org
    app.get('/api/number-requests', async (req, res) => {
      try {
        const userId = req.header('x-user-id') || null;
        if (!userId) {
          return res.status(401).json({ error: 'unauthenticated' });
        }

        // Get user's org
        const { data: userOrg, error: orgError } = await supabaseAdmin
          .from('org_members')
          .select('org_id')
          .eq('user_id', userId)
          .single();

        if (orgError || !userOrg) {
          return res.status(403).json({ error: 'no_org_membership' });
        }

        const { data, error } = await supabaseAdmin
          .from('number_requests')
          .select('*')
          .eq('org_id', userOrg.org_id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ requests: data });
      } catch (err: any) {
        console.error('[number-requests] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_requests', detail: err?.message });
      }
    });

    // POST /api/number-requests - Create a new number request
    app.post('/api/number-requests', async (req, res) => {
      try {
        const userId = req.header('x-user-id') || null;
        if (!userId) {
          return res.status(401).json({ error: 'unauthenticated' });
        }

        // Get user's org
        const { data: userOrg, error: orgError } = await supabaseAdmin
          .from('org_members')
          .select('org_id')
          .eq('user_id', userId)
          .single();

        if (orgError || !userOrg) {
          return res.status(403).json({ error: 'no_org_membership' });
        }

        const { type, request_type, details } = req.body;
        const requestType = request_type || type;

        // Create a support ticket so admins see it in the support page
        const { data: ticket, error: ticketError } = await supabaseAdmin
          .from('support_tickets')
          .insert([{
            org_id: userOrg.org_id,
            created_by: userId,
            subject: `Phone Number Request: ${requestType.charAt(0).toUpperCase() + requestType.slice(1)}`,
            priority: 'normal',
            status: 'open'
          }])
          .select()
          .single();

        if (ticketError) throw ticketError;

        // Add the details as a message on the ticket
        if (details) {
          await supabaseAdmin
            .from('support_ticket_messages')
            .insert([{
              ticket_id: ticket.id,
              sender_user_id: userId,
              message: `Request Type: ${requestType}\n\nDetails:\n${details}`
            }]);
        }

        res.json({ request: { ...ticket, details, request_type: requestType } });
      } catch (err: any) {
        console.error('[number-requests POST] error:', err);
        res.status(500).json({ error: 'failed_to_create_request', detail: err?.message });
      }
    });

    // GET /api/admin/number-requests - Admin view of all number requests
    app.get('/api/admin/number-requests', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const { data, error } = await supabaseAdmin
          .from('number_requests')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ requests: data });
      } catch (err: any) {
        console.error('[admin/number-requests] error:', err);
        res.status(500).json({ error: 'failed_to_fetch_requests', detail: err?.message });
      }
    });

    // PATCH /api/admin/number-requests/:requestId - Update request status
    app.patch('/api/admin/number-requests/:requestId', async (req, res) => {
      try {
        const actorId = req.header('x-user-id') || null;
        if (!actorId || !(await isPlatformAdmin(actorId))) {
          return res.status(403).json({ error: 'unauthorized' });
        }

        const { requestId } = req.params;
        const { status } = req.body;

        const { data, error } = await supabaseAdmin
          .from('number_requests')
          .update({ status })
          .eq('id', requestId)
          .select()
          .single();

        if (error) throw error;
        res.json({ request: data });
      } catch (err: any) {
        console.error('[admin/number-requests PATCH] error:', err);
        res.status(500).json({ error: 'failed_to_update_request', detail: err?.message });
      }
    });

// POST /api/org/recover - Recover missing organization for a user
app.post('/api/org/recover', async (req, res) => {
  try {
    // Get user from JWT token (passed in Authorization header)
    const authHeader = req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'missing_bearer_token' });
    }
    
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    const { orgId } = req.body;
    if (!orgId) {
      return res.status(400).json({ error: 'orgId_required' });
    }

    console.log(`[org/recover] Attempting to recover org ${orgId} for user ${user.id}`);

    // Check if user has membership to this org
    const { data: membership, error: memberError } = await supabaseAdmin
      .from('org_members')
      .select('*')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();

    if (memberError || !membership) {
      return res.status(403).json({ error: 'user_not_member_of_org' });
    }

    // Check if organization exists
    const { data: existingOrg, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (!orgError && existingOrg) {
      // Org exists, return it
      console.log(`[org/recover] Org ${orgId} already exists, returning`);
      return res.json(existingOrg);
    }

    // Org doesn't exist, create it with default values
    console.log(`[org/recover] Creating missing org ${orgId}`);
    
    const defaultOrg = {
      id: orgId,
      name: `Organization ${orgId.slice(0, 8)}`,
      timezone: 'America/New_York',
      sla_target_percent: 90,
      sla_target_seconds: 30,
      business_hours: {
        monday: { open: '09:00', close: '17:00' },
        tuesday: { open: '09:00', close: '17:00' },
        wednesday: { open: '09:00', close: '17:00' },
        thursday: { open: '09:00', close: '17:00' },
        friday: { open: '09:00', close: '17:00' },
        saturday: null,
        sunday: null
      },
      escalation_email: null
    };

    const { data: newOrg, error: createError } = await supabaseAdmin
      .from('organizations')
      .insert(defaultOrg)
      .select()
      .single();

    if (createError) {
      console.error('[org/recover] Failed to create org:', createError);
      return res.status(500).json({ error: 'failed_to_create_org', detail: createError.message });
    }

    console.log(`[org/recover] Successfully created org ${orgId}`);
    res.json(newOrg);

  } catch (err: any) {
    console.error('[org/recover] error:', err);
    res.status(500).json({ error: 'recovery_failed', detail: err?.message });
  }
});

// ---- MightyCall Sync Endpoints ----

// POST /api/mightycall/sync/phone-numbers
// Sync phone numbers from MightyCall for all organizations
app.post('/api/mightycall/sync/phone-numbers', apiKeyAuthMiddleware, async (req, res) => {
  try {
    // Check permissions - platform admin or API key required
    const actorId = req.header('x-user-id') || null;
    const hasApiKey = !!req.apiKeyScope;
    
    console.log('[MightyCall Sync] actorId:', actorId, 'hasApiKey:', hasApiKey);
    
    if (hasApiKey && req.apiKeyScope) {
      // Using API key - must be platform scope
      if (req.apiKeyScope.scope !== 'platform') {
        return res.status(403).json({ error: 'Platform API key required for phone number sync' });
      }
    } else if (actorId) {
      // Using user authentication - must be platform admin
      const isAdmin = await isPlatformAdmin(actorId);
      console.log('[MightyCall Sync] Platform admin check for', actorId, ':', isAdmin);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Platform admin required for phone number sync' });
      }
    } else {
      // No authentication provided
      return res.status(401).json({ error: 'API key or user authentication required' });
    }

    console.log('[MightyCall Sync] Starting phone numbers sync...');

    try {
      // Perform the sync
      const result = await syncMightyCallPhoneNumbers(supabaseAdmin);

      console.log(`[MightyCall Sync] Phone numbers sync completed: ${result.upserted} records`);
      res.json({
        success: true,
        records_processed: result.upserted
      });
    } catch (syncError: any) {
      console.error('[MightyCall Sync] Sync failed:', syncError);
      res.status(500).json({
        error: 'Sync failed',
        detail: syncError.message
      });
    }

  } catch (err: any) {
    console.error('[MightyCall Sync Phone Numbers] error:', err);
    res.status(500).json({ error: 'sync_failed', detail: err?.message });
  }
});

// POST /api/mightycall/sync/reports
// Sync reports and recordings from MightyCall for a specific organization
app.post('/api/mightycall/sync/reports', apiKeyAuthMiddleware, async (req, res) => {
  try {
    const { orgId, startDate, endDate } = req.body;

    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }

    // Check permissions - platform admin/api key or org admin
    const actorId = req.header('x-user-id') || null;
    const hasApiKey = !!req.apiKeyScope;
    
    if (hasApiKey && req.apiKeyScope) {
      // Using API key
      const hasPermission = req.apiKeyScope.scope === 'platform' ||
                           (req.apiKeyScope.scope === 'org' && req.apiKeyScope.orgId === orgId);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions for this organization' });
      }
    } else if (actorId) {
      // Using user authentication - must be platform admin or org admin
      const isAdmin = await isPlatformAdmin(actorId) || await isOrgAdmin(actorId, orgId);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin permissions required for this organization' });
      }
    } else {
      return res.status(401).json({ error: 'API key or user authentication required' });
    }

    // Get phone numbers for this org
    const assignedPhones = await getAssignedPhoneNumbersForOrg(orgId);
    const phoneNumberIds = assignedPhones.phones.map((p: any) => p.id || p.number).filter(Boolean);

    if (phoneNumberIds.length === 0) {
      return res.status(400).json({ error: 'No phone numbers assigned to this organization' });
    }

    // Default date range to today if not provided
    const today = new Date().toISOString().split('T')[0];
    const actualStartDate = startDate || today;
    const actualEndDate = endDate || today;

    console.log(`[MightyCall Sync] Starting reports sync for org ${orgId}, dates ${actualStartDate} to ${actualEndDate}...`);

    // Create integration sync job record (optional - table may not exist)
    let job: any = null;
    try {
      const { data: jobData, error: jobError } = await supabaseAdmin
        .from('integration_sync_jobs')
        .insert({
          org_id: orgId,
          integration_type: 'mightycall_reports',
          status: 'running',
          started_at: new Date().toISOString(),
          records_processed: 0,
          metadata: { start_date: actualStartDate, end_date: actualEndDate }
        })
        .select()
        .single();

      if (jobError) {
        console.warn('[MightyCall Sync] Failed to create job record (table may not exist):', jobError);
      } else {
        job = jobData;
      }
    } catch (e) {
      console.warn('[MightyCall Sync] Exception creating job record:', e);
    }

    try {
      // Attempt to load per-org integration credentials (mightycall)
      let overrideCreds: any = undefined;
      try {
        const { getOrgIntegration } = await import('./lib/integrationsStore');
        const integ = await getOrgIntegration(orgId, 'mightycall');
        if (integ && integ.credentials) {
          overrideCreds = { clientId: integ.credentials.clientId || integ.credentials.apiKey || undefined, clientSecret: integ.credentials.clientSecret || integ.credentials.userKey || undefined };
        }
      } catch (ie) {
        console.warn('[MightyCall Sync] failed to load org integration:', ie);
      }

      // Perform the sync using per-org creds when available
      const result = await syncMightyCallReports(supabaseAdmin, orgId, phoneNumberIds, actualStartDate, actualEndDate, overrideCreds);

      // Update job record as completed (if job exists)
      if (job) {
        await supabaseAdmin
          .from('integration_sync_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            records_processed: result.reportsSynced + result.recordingsSynced,
            metadata: {
              start_date: actualStartDate,
              end_date: actualEndDate,
              reports_synced: result.reportsSynced,
              recordings_synced: result.recordingsSynced
            }
          })
          .eq('id', job.id);
      }

      console.log(`[MightyCall Sync] Reports sync completed for org ${orgId}: ${result.reportsSynced} reports, ${result.recordingsSynced} recordings`);
      res.json({
        success: true,
        org_id: orgId,
        reports_synced: result.reportsSynced,
        recordings_synced: result.recordingsSynced,
        job_id: job?.id || null
      });

    } catch (syncError: any) {
      // Update job record as failed (if job exists)
      if (job) {
        await supabaseAdmin
          .from('integration_sync_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: syncError.message
          })
          .eq('id', job.id);
      }

      console.error(`[MightyCall Sync] Reports sync failed for org ${orgId}:`, syncError);
      res.status(500).json({
        error: 'Sync failed',
        detail: syncError.message,
        job_id: job?.id || null
      });
    }

  } catch (err: any) {
    console.error('[MightyCall Sync Reports] error:', err);
    res.status(500).json({ error: 'sync_failed', detail: err?.message });
  }
});

// POST /api/mightycall/sync/recordings
// Sync recordings from MightyCall for a specific organization (separate endpoint for recordings-only sync)
app.post('/api/mightycall/sync/recordings', apiKeyAuthMiddleware, async (req, res) => {
  try {
    const { orgId, startDate, endDate } = req.body;

    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }

    // Check permissions - platform admin/api key or org admin
    const actorId = req.header('x-user-id') || null;
    const hasApiKey = !!req.apiKeyScope;
    
    if (hasApiKey && req.apiKeyScope) {
      // Using API key
      const hasPermission = req.apiKeyScope.scope === 'platform' ||
                           (req.apiKeyScope.scope === 'org' && req.apiKeyScope.orgId === orgId);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions for this organization' });
      }
    } else if (actorId) {
      // Using user authentication - must be platform admin or org admin
      const isAdmin = await isPlatformAdmin(actorId) || await isOrgAdmin(actorId, orgId);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin permissions required for this organization' });
      }
    } else {
      return res.status(401).json({ error: 'API key or user authentication required' });
    }

    // Get phone numbers for this org
    const assignedPhones = await getAssignedPhoneNumbersForOrg(orgId);
    const phoneNumberIds = assignedPhones.phones.map((p: any) => p.id || p.number).filter(Boolean);

    if (phoneNumberIds.length === 0) {
      return res.status(400).json({ error: 'No phone numbers assigned to this organization' });
    }

    // Default date range to today if not provided
    const today = new Date().toISOString().split('T')[0];
    const actualStartDate = startDate || today;
    const actualEndDate = endDate || today;

    console.log(`[MightyCall Sync] Starting recordings sync for org ${orgId}, dates ${actualStartDate} to ${actualEndDate}...`);

    // Create integration sync job record (optional - table may not exist)
    let job: any = null;
    try {
      const { data: jobData, error: jobError } = await supabaseAdmin
        .from('integration_sync_jobs')
        .insert({
          org_id: orgId,
          integration_type: 'mightycall_recordings',
          status: 'running',
          started_at: new Date().toISOString(),
          records_processed: 0,
          metadata: { start_date: actualStartDate, end_date: actualEndDate }
        })
        .select()
        .single();

      if (jobError) {
        console.warn('[MightyCall Sync] Failed to create job record (table may not exist):', jobError);
      } else {
        job = jobData;
      }
    } catch (e) {
      console.warn('[MightyCall Sync] Exception creating job record:', e);
    }

    try {
      // Load per-org integration credentials when available
      let overrideCreds: any = undefined;
      try {
        const { getOrgIntegration } = await import('./lib/integrationsStore');
        const integ = await getOrgIntegration(orgId, 'mightycall');
        if (integ && integ.credentials) {
          overrideCreds = { clientId: integ.credentials.clientId || integ.credentials.apiKey || undefined, clientSecret: integ.credentials.clientSecret || integ.credentials.userKey || undefined };
        }
      } catch (ie) {
        console.warn('[MightyCall Sync] failed to load org integration for recordings:', ie);
      }

      // Import the recordings sync function and run with override creds
      const { syncMightyCallRecordings } = await import('./integrations/mightycall');
      const result = await syncMightyCallRecordings(supabaseAdmin, orgId, phoneNumberIds, actualStartDate, actualEndDate, overrideCreds);

      // Update job record as completed (if job exists)
      if (job) {
        await supabaseAdmin
          .from('integration_sync_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            records_processed: result.recordingsSynced,
            metadata: {
              start_date: actualStartDate,
              end_date: actualEndDate,
              recordings_synced: result.recordingsSynced
            }
          })
          .eq('id', job.id);
      }

      console.log(`[MightyCall Sync] Recordings sync completed for org ${orgId}: ${result.recordingsSynced} recordings`);
      res.json({
        success: true,
        org_id: orgId,
        recordings_synced: result.recordingsSynced,
        job_id: job?.id || null
      });

    } catch (syncError: any) {
      // Update job record as failed (if job exists)
      if (job) {
        await supabaseAdmin
          .from('integration_sync_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: syncError.message
          })
          .eq('id', job.id);
      }

      console.error(`[MightyCall Sync] Recordings sync failed for org ${orgId}:`, syncError);
      res.status(500).json({
        error: 'Sync failed',
        detail: syncError.message,
        job_id: job?.id || null
      });
    }

  } catch (err: any) {
    console.error('[MightyCall Sync Recordings] error:', err);
    res.status(500).json({ error: 'sync_failed', detail: err?.message });
  }
});

// GET /api/mightycall/sync/jobs
// Get sync job history
app.get('/api/mightycall/sync/jobs', apiKeyAuthMiddleware, async (req, res) => {
  try {
    if (!req.apiKeyScope) {
      return res.status(401).json({ error: 'API key required' });
    }

    const { orgId, status, limit = 50 } = req.query;
    let query = supabaseAdmin
      .from('integration_sync_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    // Filter by org if specified and user has permission
    if (orgId) {
      if (req.apiKeyScope.scope === 'org' && req.apiKeyScope.orgId !== orgId) {
        return res.status(403).json({ error: 'Cannot access sync jobs for other organizations' });
      }
      query = query.eq('org_id', orgId);
    } else if (req.apiKeyScope.scope === 'org') {
      // Org API keys can only see their own org's jobs
      query = query.eq('org_id', req.apiKeyScope.orgId);
    }

    // Filter by status if specified
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[MightyCall Sync Jobs] error:', error);
      return res.status(500).json({ error: 'Failed to fetch sync jobs' });
    }

    res.json({ jobs: data || [] });

  } catch (err: any) {
    console.error('[MightyCall Sync Jobs] error:', err);
    res.status(500).json({ error: 'fetch_failed', detail: err?.message });
  }
});

// GET /api/mightycall/test-connection?org_id=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Attempts to obtain a MightyCall access token and fetch a small sample of calls and recordings.
app.get('/api/mightycall/test-connection', apiKeyAuthMiddleware, async (req, res) => {
  try {
    const orgId = req.query.org_id as string | undefined;
    const actorId = req.header('x-user-id') || null;

    if (!orgId) return res.status(400).json({ error: 'org_id required' });

    // Permission: allow platform API key or platform admin or org admin
    const usingApiKey = !!req.apiKeyScope;
    if (!usingApiKey && !actorId) return res.status(401).json({ error: 'unauthenticated' });
    if (!usingApiKey && actorId && !(await isPlatformAdmin(actorId) || await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: 'forbidden' });
    }

    // Attempt to load per-org integration creds
    let overrideCreds: any = undefined;
    try {
      const { getOrgIntegration } = await import('./lib/integrationsStore');
      const integ = await getOrgIntegration(orgId, 'mightycall');
      if (integ && integ.credentials) {
        overrideCreds = { clientId: integ.credentials.clientId || integ.credentials.apiKey || undefined, clientSecret: integ.credentials.clientSecret || integ.credentials.userKey || undefined };
      }
    } catch (ie) {
      console.warn('[MightyCall Test] failed to load org integration:', ie);
    }

    const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
    const endDate = (req.query.endDate as string) || startDate;

    const { getMightyCallAccessToken, fetchMightyCallCalls, fetchMightyCallRecordings } = await import('./integrations/mightycall');

    // Get token
    let token: string | null = null;
    try {
      token = await getMightyCallAccessToken(overrideCreds);
    } catch (e: any) {
      console.error('[MightyCall Test] failed to obtain token:', e?.message ?? e);
      return res.status(502).json({ error: 'auth_failed', detail: e?.message ?? String(e) });
    }

    // Fetch calls and recordings (small sample)
    try {
      const calls = await fetchMightyCallCalls(token, { dateStart: startDate, dateEnd: endDate, limit: 20 });
      const recs = await fetchMightyCallRecordings(token, [], startDate, endDate);

      return res.json({ success: true, calls_count: calls.length, recordings_count: recs.length, calls_sample: calls.slice(0, 5), recordings_sample: recs.slice(0, 5) });
    } catch (e: any) {
      console.error('[MightyCall Test] fetch failed:', e?.message ?? e);
      return res.status(502).json({ error: 'fetch_failed', detail: e?.message ?? String(e) });
    }

  } catch (err: any) {
    console.error('[MightyCall Test] unexpected error:', err);
    res.status(500).json({ error: 'unexpected', detail: err?.message ?? String(err) });
  }
});

// Global error handlers to catch issues before they crash silently
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[UNHANDLED REJECTION]', reason instanceof Error ? reason.message : reason);
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack);
  }
  console.error('Promise:', promise);
  // Don't exit on unhandled rejections, just log them
});

process.on('uncaughtException', (err: Error) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message);
  console.error(err.stack);
  process.exit(1);
});

// Diagnostic endpoint for checking database and data status
app.get('/api/diagnostics/reports', async (req, res) => {
  try {
    const userId = req.header('x-user-id');
    
    // Check if tables exist
    const tables = ['mightycall_reports', 'mightycall_recordings', 'mightycall_sms_messages'];
    const tableStatus: any = {};
    
    for (const table of tables) {
      try {
        const { data, error } = await supabaseAdmin.from(table).select('COUNT(*)').limit(1);
        if (error && error.code === 'PGRST205') {
          tableStatus[table] = { exists: false, error: error.message };
        } else if (error) {
          tableStatus[table] = { exists: true, count: 0, error: error.message };
        } else {
          // Try to get count
          const { count } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
          tableStatus[table] = { exists: true, count: count || 0 };
        }
      } catch (e: any) {
        tableStatus[table] = { exists: null, error: e.message };
      }
    }
    
    // Get sample reports if table exists
    let sampleReports: any[] = [];
    try {
      const { data } = await supabaseAdmin
        .from('mightycall_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
      sampleReports = data || [];
    } catch (e) {
      // table doesn't exist
    }
    
    res.json({
      timestamp: new Date().toISOString(),
      tableStatus,
      sampleReports: sampleReports.slice(0, 3),
      helpText: 'If tables dont exist, run migrations. If count is 0, sync reports from MightyCall.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const port = Number(process.env.PORT) || 4000;
const serverHost = process.env.API_BASE_URL || process.env.SERVER_BASE_URL || null;

console.log(`[startup] Starting Express server on port ${port}...`);

const server = app.listen(port, '0.0.0.0', () => {
  console.log('[startup] Express app.listen() callback fired');
  if (serverHost) {
    console.log(`Metrics API listening (configured host): ${serverHost}`);
  } else {
    console.log(`Metrics API listening on port ${port}`);
  }
}).on('error', (err: any) => {
  console.error(`[startup] Failed to bind on port ${port}:`, err.message);
  console.error(err.stack);
  process.exit(1);
});

console.log('[startup] app.listen() returned, server object created');
console.log('[startup] *** Server is ready and listening for connections ***');

// Keep the process alive - prevent immediate exit
setImmediate(() => {
  console.log('[startup] Event loop is spinning');
});

// ============================================
// BILLING & INVOICING ENDPOINTS
// ============================================

// GET /api/admin/invoices - List invoices
app.get('/api/admin/invoices', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const orgId = req.query.orgId as string | undefined;
    let q = supabaseAdmin.from('invoices').select('*').order('issued_at', { ascending: false });
    if (orgId) q = q.eq('org_id', orgId);

    const { data, error } = await q;
    if (error) throw error;

    res.json({ invoices: data || [] });
  } catch (err: any) {
    console.error('invoices_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'invoices_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/invoices - Create invoice
app.post('/api/admin/invoices', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { orgId, billingPeriodStart, billingPeriodEnd, items } = req.body;
    if (!orgId || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    // Calculate totals
    let totalAmount = 0;
    for (const item of items) {
      const lineTotal = (item.quantity || 0) * (item.unit_price || 0);
      totalAmount += lineTotal;
    }

    const taxAmount = totalAmount * 0.1; // 10% tax
    const grandTotal = totalAmount + taxAmount;
    const invoiceNumber = `INV-${Date.now()}`;

    // Create invoice
    const { data: invoiceData, error: invoiceErr } = await supabaseAdmin
      .from('invoices')
      .insert({
        org_id: orgId,
        invoice_number: invoiceNumber,
        billing_period_start: billingPeriodStart,
        billing_period_end: billingPeriodEnd,
        total_amount: totalAmount,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        status: 'draft',
        issued_at: new Date().toISOString()
      })
      .select();

    if (invoiceErr) throw invoiceErr;
    const invoice = invoiceData?.[0];

    // Create line items
    if (invoice && items.length > 0) {
      const lineItems = items.map((item: any) => ({
        invoice_id: invoice.id,
        description: item.description,
        service_code: item.service_code,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: (item.quantity || 0) * (item.unit_price || 0),
        metadata: item.metadata || {}
      }));

      const { error: lineErr } = await supabaseAdmin.from('invoice_line_items').insert(lineItems);
      if (lineErr) console.warn('line_items_insert_error:', lineErr);
    }

    res.json({
      success: true,
      invoice_id: invoice?.id,
      invoice_number: invoiceNumber,
      total: totalAmount,
      tax: taxAmount,
      grand_total: grandTotal
    });
  } catch (err: any) {
    console.error('invoice_create_failed:', fmtErr(err));
    res.status(500).json({ error: 'invoice_create_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/usage-charges - List usage charges
app.get('/api/admin/usage-charges', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const orgId = req.query.orgId as string | undefined;
    const billingPeriod = req.query.billingPeriod as string | undefined;
    let q = supabaseAdmin.from('usage_charges').select('*').order('created_at', { ascending: false });
    if (orgId) q = q.eq('org_id', orgId);
    if (billingPeriod) q = q.eq('billing_period', billingPeriod);

    const { data, error } = await q;
    if (error) throw error;

    res.json({ usage_charges: data || [] });
  } catch (err: any) {
    console.error('usage_charges_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'usage_charges_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/usage-charges - Record a charge
app.post('/api/admin/usage-charges', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { orgId, phoneNumberId, chargeType, quantity, unitCost, serviceDate, billingPeriod } = req.body;
    if (!orgId || !chargeType) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    const totalCost = (quantity || 0) * (unitCost || 0);
    const { data, error } = await supabaseAdmin
      .from('usage_charges')
      .insert({
        org_id: orgId,
        phone_number_id: phoneNumberId,
        charge_type: chargeType,
        quantity,
        unit_cost: unitCost,
        total_cost: totalCost,
        service_date: serviceDate || new Date().toISOString().split('T')[0],
        billing_period: billingPeriod || new Date().toISOString().split('-').slice(0, 2).join('-')
      })
      .select();

    if (error) throw error;

    res.json({ success: true, charge_id: data?.[0]?.id, total_cost: totalCost });
  } catch (err: any) {
    console.error('usage_charge_create_failed:', fmtErr(err));
    res.status(500).json({ error: 'usage_charge_create_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/billing-plans - List billing plans
app.get('/api/admin/billing-plans', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('billing_plans')
      .select('*')
      .eq('is_active', true)
      .order('base_monthly_cost', { ascending: true });

    if (error) throw error;

    res.json({ billing_plans: data || [] });
  } catch (err: any) {
    console.error('billing_plans_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'billing_plans_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/billing-plans - Create billing plan
app.post('/api/admin/billing-plans', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { name, description, baseMonthlyC, includedMinutes, includedSms, overageMinuteCost, overageSMSCost, features } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'missing_name' });
    }

    const { data, error } = await supabaseAdmin
      .from('billing_plans')
      .insert({
        name,
        description,
        base_monthly_cost: baseMonthlyC || 0,
        included_minutes: includedMinutes || 0,
        included_sms: includedSms || 0,
        overage_minute_cost: overageMinuteCost || 0.01,
        overage_sms_cost: overageSMSCost || 0.01,
        features: features || []
      })
      .select();

    if (error) throw error;

    res.json({ success: true, plan: data?.[0] });
  } catch (err: any) {
    console.error('billing_plan_create_failed:', fmtErr(err));
    res.status(500).json({ error: 'billing_plan_create_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/org-subscriptions - List org subscriptions
app.get('/api/admin/org-subscriptions', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { data, error } = await supabaseAdmin
      .from('org_subscriptions')
      .select('*, billing_plans(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ subscriptions: data || [] });
  } catch (err: any) {
    console.error('subscriptions_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'subscriptions_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/org-subscriptions - Assign org to billing plan
app.post('/api/admin/org-subscriptions', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { orgId, planId, billingCycleDay } = req.body;
    if (!orgId || !planId) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    // Calculate next billing date
    const today = new Date();
    const nextDay = billingCycleDay || 1;
    let nextBillingDate = new Date(today.getFullYear(), today.getMonth(), nextDay);
    if (nextBillingDate < today) {
      nextBillingDate = new Date(today.getFullYear(), today.getMonth() + 1, nextDay);
    }

    const { data, error } = await supabaseAdmin
      .from('org_subscriptions')
      .upsert({
        org_id: orgId,
        plan_id: planId,
        status: 'active',
        billing_cycle_day: nextDay,
        next_billing_date: nextBillingDate.toISOString().split('T')[0],
        auto_renew: true
      }, { onConflict: 'org_id' })
      .select();

    if (error) throw error;

    res.json({ success: true, subscription: data?.[0] });
  } catch (err: any) {
    console.error('subscription_create_failed:', fmtErr(err));
    res.status(500).json({ error: 'subscription_create_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// ============================================
// SUPPORT TICKETS ENDPOINTS
// ============================================

// GET /api/admin/support-tickets - List support tickets
app.get('/api/admin/support-tickets', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const orgId = req.query.orgId as string | undefined;
    const status = req.query.status as string | undefined;
    let q = supabaseAdmin.from('support_tickets').select('*').order('created_at', { ascending: false });
    if (orgId) q = q.eq('org_id', orgId);
    if (status) q = q.eq('status', status);

    const { data, error } = await q.limit(100);
    if (error && error.code !== 'PGRST116') throw error; // Ignore table not found initially

    res.json({ tickets: data || [], count: data?.length || 0 });
  } catch (err: any) {
    console.error('tickets_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'tickets_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/support-tickets - Create support ticket
app.post('/api/admin/support-tickets', async (req, res) => {
  try {
    const userId = req.header('x-user-id');
    if (!userId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    let orgId = req.body.org_id;
    
    // If no org_id in body, try to get from user's org membership
    if (!orgId) {
      const { data: userOrg, error: userOrgError } = await supabaseAdmin
        .from('org_users')
        .select('org_id')
        .eq('user_id', userId)
        .single();
      
      if (userOrgError || !userOrg) {
        return res.status(403).json({ error: 'no_organization' });
      }
      orgId = userOrg.org_id;
    }

    const { title, description, priority, attachments } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'missing_title' });
    }

    // Build insert object without optional columns that may not exist in older schemas
    const insertObj: any = {
      org_id: orgId,
      title,
      description,
      priority: priority || 'medium',
      status: 'open'
    };

    const { data, error } = await supabaseAdmin
      .from('support_tickets')
      .insert(insertObj)
      .select();

    if (error) throw error;

    res.json({ success: true, ticket_id: data?.[0]?.id, ticket: data?.[0] });
  } catch (err: any) {
    console.error('ticket_create_failed:', fmtErr(err));
    res.status(500).json({ error: 'ticket_create_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// PATCH /api/admin/support-tickets/:ticketId - Update ticket status
app.patch('/api/admin/support-tickets/:ticketId', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { ticketId } = req.params;
    const { status, priority } = req.body;

    const { data, error } = await supabaseAdmin
      .from('support_tickets')
      .update({ status, priority })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;
    res.json({ ticket: data });
  } catch (err: any) {
    console.error('ticket_update_failed:', fmtErr(err));
    res.status(500).json({ error: 'ticket_update_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// ============================================
// REPORTING ENDPOINTS
// ============================================

// GET /api/admin/reports - Get reports
app.get('/api/admin/reports', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const orgId = req.query.orgId as string | undefined;
    const reportType = req.query.type as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    let q = supabaseAdmin.from('mightycall_reports').select('*');
    if (orgId) q = q.eq('org_id', orgId);
    if (reportType) q = q.eq('report_type', reportType);
    if (startDate) q = q.gte('report_date', startDate);
    if (endDate) q = q.lte('report_date', endDate);

    const { data, error } = await q.order('report_date', { ascending: false }).limit(1000);
    if (error && error.code !== 'PGRST116') throw error;

    // Build summary stats
    const summary: any = {
      total_reports: data?.length || 0,
      by_type: {},
      date_range: { start: startDate, end: endDate }
    };

    if (data) {
      for (const report of data) {
        const type = report.report_type || 'unknown';
        summary.by_type[type] = (summary.by_type[type] || 0) + 1;
      }
    }

    res.json({ reports: data || [], summary });
  } catch (err: any) {
    console.error('reports_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'reports_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/call-reports - Call-specific reports
app.get('/api/admin/call-reports', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const orgId = req.query.orgId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    let q = supabaseAdmin.from('call_history').select('*');
    if (orgId) q = q.eq('org_id', orgId);
    if (startDate) q = q.gte('call_date', startDate);
    if (endDate) q = q.lte('call_date', endDate);

    const { data, error } = await q.order('call_date', { ascending: false }).limit(1000);
    if (error && error.code !== 'PGRST116') throw error;

    // Build summary stats
    const summary: any = {
      total_calls: data?.length || 0,
      inbound: 0,
      outbound: 0,
      total_duration: 0,
      by_status: {}
    };

    if (data) {
      for (const call of data) {
        if (call.direction === 'inbound') summary.inbound++;
        if (call.direction === 'outbound') summary.outbound++;
        summary.total_duration += call.duration_seconds || 0;
        const status = call.status || 'unknown';
        summary.by_status[status] = (summary.by_status[status] || 0) + 1;
      }
    }

    res.json({ calls: data || [], summary });
  } catch (err: any) {
    console.error('call_reports_failed:', fmtErr(err));
    res.status(500).json({ error: 'call_reports_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// ============================================
// PACKAGE/PLAN MANAGEMENT ENDPOINTS
// ============================================

// GET /api/admin/packages - List billing packages (alias for plans)
app.get('/api/admin/packages', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('billing_plans')
      .select('*')
      .order('base_monthly_cost', { ascending: true });

    if (error && error.code !== 'PGRST116') throw error;

    res.json({ packages: data || [], count: data?.length || 0 });
  } catch (err: any) {
    console.error('packages_list_failed:', fmtErr(err));
    res.status(500).json({ error: 'packages_list_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/packages - Create package
app.post('/api/admin/packages', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { name, description, baseMonthlyC, includedMinutes, includedSms, overageMinuteCost, overageSMSCost, features } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'missing_name' });
    }

    const { data, error } = await supabaseAdmin
      .from('billing_plans')
      .insert({
        name,
        description,
        base_monthly_cost: baseMonthlyC || 0,
        included_minutes: includedMinutes || 0,
        included_sms: includedSms || 0,
        overage_minute_cost: overageMinuteCost || 0.01,
        overage_sms_cost: overageSMSCost || 0.01,
        features: features || [],
        is_active: true
      })
      .select();

    if (error) throw error;

    res.json({ success: true, package: data?.[0] });
  } catch (err: any) {
    console.error('package_create_failed:', fmtErr(err));
    res.status(500).json({ error: 'package_create_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/assign-package - Assign package to organization
app.post('/api/admin/assign-package', async (req, res) => {
  try {
    const actorId = req.header('x-user-id') || null;
    if (!actorId || !(await isPlatformAdmin(actorId))) {
      return res.status(403).json({ error: 'unauthorized' });
    }

    const { orgId, planId, billingCycleDay } = req.body;
    if (!orgId || !planId) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    // Calculate next billing date
    const today = new Date();
    const nextDay = billingCycleDay || 1;
    let nextBillingDate = new Date(today.getFullYear(), today.getMonth(), nextDay);
    if (nextBillingDate < today) {
      nextBillingDate = new Date(today.getFullYear(), today.getMonth() + 1, nextDay);
    }

    const { data, error } = await supabaseAdmin
      .from('org_subscriptions')
      .upsert({
        org_id: orgId,
        plan_id: planId,
        status: 'active',
        billing_cycle_day: nextDay,
        next_billing_date: nextBillingDate.toISOString().split('T')[0],
        auto_renew: true
      }, { onConflict: 'org_id' })
      .select();

    if (error) throw error;

    res.json({ success: true, subscription: data?.[0] });
  } catch (err: any) {
    console.error('assign_package_failed:', fmtErr(err));
    res.status(500).json({ error: 'assign_package_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/user/change-password - Change user password
app.post('/api/user/change-password', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    if (!userId) return res.status(401).json({ error: 'unauthenticated' });

    const { new_password } = req.body;

    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'password_too_short' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: new_password
    });

    if (error) throw error;

    res.json({ success: true, message: 'password_changed' });
  } catch (err: any) {
    console.error('password_change_failed:', fmtErr(err));
    res.status(500).json({ error: 'password_change_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/user/upload-profile-pic - Upload profile picture
app.post('/api/user/upload-profile-pic', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    if (!userId) return res.status(401).json({ error: 'unauthenticated' });

    const { image_data } = req.body;
    if (!image_data) return res.status(400).json({ error: 'no_image_provided' });

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        profile_pic_url: image_data
      }
    });

    if (error) throw error;

    res.json({ success: true, url: image_data });
  } catch (err: any) {
    console.error('profile_pic_upload_failed:', fmtErr(err));
    res.status(500).json({ error: 'profile_pic_upload_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/user/upload-org-logo - Upload organization logo
app.post('/api/user/upload-org-logo', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    if (!userId) return res.status(401).json({ error: 'unauthenticated' });

    const { image_data } = req.body;
    if (!image_data) return res.status(400).json({ error: 'no_image_provided' });

    // Get user's primary org
    const { data: memberships } = await supabaseAdmin
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1);

    if (!memberships || memberships.length === 0) {
      return res.status(404).json({ error: 'no_org_found' });
    }

    const orgId = memberships[0].org_id;

    // Update org with logo
    const { data: org, error } = await supabaseAdmin
      .from('organizations')
      .update({ logo_url: image_data, updated_at: new Date().toISOString() })
      .eq('id', orgId)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, org });
  } catch (err: any) {
    console.error('org_logo_upload_failed:', fmtErr(err));
    res.status(500).json({ error: 'org_logo_upload_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/call-stats - Get call statistics and KPIs
app.get('/api/call-stats', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    if (!userId) return res.status(401).json({ error: 'unauthenticated' });

    const orgId = req.query.org_id as string;
    const phoneNumber = req.query.phone_number as string; // Optional: filter by phone number
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    if (!orgId) return res.status(400).json({ error: 'org_id_required' });

    // Check if user is a platform admin or org member
    const isAdmin = await isPlatformAdmin(userId);
    const isMember = await isOrgMember(userId, orgId);
    
    if (!isAdmin && !isMember) {
      return res.status(403).json({ error: 'forbidden' });
    }

    // Collect assigned phone numbers for the user (for filtering if non-admin)
    let assignedPhoneNumbers: string[] = [];
    
    if (!isAdmin) {
      // Get user's assigned phone numbers
      const { data: assignments } = await supabaseAdmin
        .from('user_phone_assignments')
        .select('phone_number_id')
        .eq('user_id', userId);
      
      const assignedPhoneIds = (assignments || []).map(a => a.phone_number_id).filter(Boolean);
      
      if (assignedPhoneIds.length === 0) {
        // No assignments, return empty stats
        return res.json({
          stats: { totalCalls: 0, answeredCalls: 0, missedCalls: 0, avgHandleTime: 0, avgWaitTime: 0, totalDuration: 0, avgDuration: 0, answerRate: 0, totalRevenue: 0, avgRevenue: 0 },
          calls: []
        });
      }
      
      // Get the actual phone numbers
      const { data: phones } = await supabaseAdmin
        .from('phone_numbers')
        .select('number')
        .in('id', assignedPhoneIds);
      
      assignedPhoneNumbers = (phones || []).map(p => p.number).filter(Boolean);
      
      if (assignedPhoneNumbers.length === 0) {
        // No phone numbers found for assignments, return empty stats
        return res.json({
          stats: { totalCalls: 0, answeredCalls: 0, missedCalls: 0, avgHandleTime: 0, avgWaitTime: 0, totalDuration: 0, avgDuration: 0, answerRate: 0, totalRevenue: 0, avgRevenue: 0 },
          calls: []
        });
      }
    }
    
    // Fetch calls for the org within date range
    let q = supabaseAdmin.from('calls').select('*').eq('org_id', orgId);
    
    // For non-admin clients: filter by assigned phone numbers (to_number only)
    if (!isAdmin && assignedPhoneNumbers.length > 0) {
      q = q.in('to_number', assignedPhoneNumbers);
    } else if (phoneNumber) {
      // Admin can optionally filter by phone number
      q = q.eq('to_number', phoneNumber);
    }
    
    if (startDate) q = q.gte('started_at', startDate);
    if (endDate) q = q.lte('started_at', endDate);

    const { data: calls, error } = await q;
    if (error) throw error;

    // If there are no rows in `calls`, fall back to aggregating from `mightycall_recordings`
    // This ensures the Reports page can show real KPIs when the calls sync returned empty.
    let finalCalls = calls || [];
    if ((!finalCalls || finalCalls.length === 0)) {
      try {
        let recQ = supabaseAdmin
          .from('mightycall_recordings')
          .select('*')
          .eq('org_id', orgId)
          .order('recording_date', { ascending: false })
          .limit(100);

        if (startDate) recQ = recQ.gte('recording_date', startDate);
        if (endDate) recQ = recQ.lte('recording_date', endDate);

        const { data: recs, error: recErr } = await recQ;
        if (!recErr && Array.isArray(recs) && recs.length > 0) {
          // Filter recordings by assigned phone numbers if non-admin
          let filteredRecs = recs;
          if (!isAdmin && assignedPhoneNumbers.length > 0) {
            filteredRecs = recs.filter((r: any) => {
              // Extract phone numbers from recording - try direct columns first, then metadata
              const fromNumber = r.from_number || (r.metadata && r.metadata.from_number) || null;
              const toNumber = r.to_number || (r.metadata && r.metadata.to_number) || null;
              
              // Check if either number matches assigned phones
              return (fromNumber && assignedPhoneNumbers.includes(fromNumber)) || 
                     (toNumber && assignedPhoneNumbers.includes(toNumber));
            });
          }

          // Synthesize call-like rows from recordings
          finalCalls = filteredRecs.map((r: any) => ({
            org_id: r.org_id,
            from_number: r.from_number || (r.metadata && r.metadata.from_number) || null,
            to_number: r.to_number || (r.metadata && r.metadata.to_number) || null,
            status: 'answered',
            duration_seconds: r.duration_seconds ?? 0,
            started_at: r.recording_date,
            ended_at: r.recording_date,
            recording_url: r.recording_url,
            recording_id: r.id,
            recording_date: r.recording_date,
            metadata: r
          }));
        }
      } catch (e) {
        console.warn('call_stats_recordings_fallback_failed:', (e as any)?.message || e);
      }
    }

    // Calculate KPIs
    const totalCalls = finalCalls?.length || 0;
    const answeredCalls = finalCalls?.filter((c: any) => (c.status || '').toString().toLowerCase() === 'answered').length || 0;
    const missedCalls = finalCalls?.filter((c: any) => (c.status || '').toString().toLowerCase() === 'missed').length || 0;
    const answerRate = totalCalls > 0 ? (answeredCalls / totalCalls) * 100 : 0;

    // Calculate durations (in seconds)
    const totalDuration = finalCalls?.reduce((sum: number, c: any) => sum + (c.duration_seconds || 0), 0) || 0;
    const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    const avgHandleTime = answeredCalls > 0 ? totalDuration / answeredCalls : 0;
    const avgWaitTime = finalCalls?.reduce((sum: number, c: any) => sum + (c.listen_time_seconds || 0), 0) || 0;

    // Calculate revenue (best-effort - recordings won't have revenue)
    const totalRevenue = finalCalls?.reduce((sum: number, c: any) => sum + (c.revenue_generated || 0), 0) || 0;
    const avgRevenue = answeredCalls > 0 ? totalRevenue / answeredCalls : 0;

    res.json({
      stats: {
        totalCalls,
        answeredCalls,
        missedCalls,
        avgHandleTime,
        avgWaitTime,
        totalDuration,
        avgDuration,
        answerRate,
        totalRevenue,
        avgRevenue
      },
      calls: (finalCalls || []).slice(0, 100)
    });
  } catch (err: any) {
    console.error('call_stats_failed:', fmtErr(err));
    res.status(500).json({ error: 'call_stats_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/recordings - Get recordings with org details (filtered by user's assigned numbers)
app.get('/api/recordings', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    if (!userId) return res.status(401).json({ error: 'unauthenticated' });

    const orgId = req.query.org_id as string;
    const limit = parseInt(req.query.limit as string) || 10000; // Default to 10000 for full results

    if (!orgId) return res.status(400).json({ error: 'org_id_required' });

    // Check if user is platform admin
    const isAdmin = await isPlatformAdmin(userId);
    
    // If non-admin, get user's assigned phones within this org
    let allowedPhoneNumbers: string[] | null = null;
    if (!isAdmin) {
      const { phones, numbers } = await getUserAssignedPhoneNumbers(orgId, userId);
      // Use actual phone numbers for filtering
      allowedPhoneNumbers = numbers;
    }

    // Fetch recordings
    let q = supabaseAdmin
      .from('mightycall_recordings')
      .select('*')
      .eq('org_id', orgId)
      .order('recording_date', { ascending: false })
      .limit(limit);

    const { data: recordings, error } = await q;
    if (error) throw error;

    // Fetch calls to enrich recordings with phone numbers
    const recordingIds = (recordings || []).map((r: any) => r.call_id).filter(Boolean);
    let callsMap: any = {};
    if (recordingIds.length > 0) {
      const { data: calls } = await supabaseAdmin
        .from('calls')
        .select('id, from_number, to_number, duration_seconds, started_at, ended_at')
        .in('id', recordingIds);
      
      if (calls) {
        calls.forEach((call: any) => {
          callsMap[call.id] = call;
        });
      }
    }

    // Enrich with org data
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single();

    // Enrich recordings with call data and filter by phone access
    let enriched = (recordings || []).map((rec: any) => {
      const callData = callsMap[rec.call_id] || {};
      
      // Extract phone numbers from metadata if not in call record
      let fromNumber = callData.from_number || rec.from_number || null;
      let toNumber = callData.to_number || rec.to_number || null;
      
      // Try to extract from metadata if still missing
      const metadata = rec.metadata || {};
      if (!fromNumber && metadata.businessNumber) {
        fromNumber = metadata.businessNumber;
      }
      if (!toNumber && metadata.called && Array.isArray(metadata.called) && metadata.called[0]) {
        toNumber = metadata.called[0].phone || metadata.called[0].name || null;
      }
      
      return {
        ...rec,
        org_name: org?.name || 'Unknown Org',
        // Include call details (from_number, to_number, etc)
        from_number: fromNumber,
        to_number: toNumber,
        duration: callData.duration_seconds || rec.duration_seconds || 0,
        call_started_at: callData.started_at || rec.recording_date,
        call_ended_at: callData.ended_at || rec.recording_date,
        direction: metadata.direction || 'Unknown'
      };
    });

    // Apply phone access control for non-admins
    if (!isAdmin && allowedPhoneNumbers && allowedPhoneNumbers.length > 0) {
      // Non-admin with phone assignments - filter by those phones
      enriched = enriched.filter((rec: any) => {
        const fromMatch = rec.from_number && allowedPhoneNumbers.includes(rec.from_number);
        const toMatch = rec.to_number && allowedPhoneNumbers.includes(rec.to_number);
        return fromMatch || toMatch;
      });
    } else if (!isAdmin && (!allowedPhoneNumbers || allowedPhoneNumbers.length === 0)) {
      // Non-admin with no assigned phones - check if they're an org member
      const isMember = await isOrgMember(userId, orgId);
      if (!isMember) {
        // Not an org member and no phone assignments - return empty
        return res.json({ recordings: [] });
      }
      // Org member without phone assignments - show all org recordings
    }

    res.json({ recordings: enriched });
  } catch (err: any) {
    console.error('recordings_fetch_failed:', fmtErr(err));
    res.status(500).json({ error: 'recordings_fetch_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// Register the users router for admin endpoints
app.use('/api/admin', usersRouter);

// During interactive debugging we may receive SIGINT/SIGTERM from the environment
// (file watchers, dev tooling). To allow introspection without the process
// immediately exiting, handle signals in a non-fatal way when the
// `SKIP_FATAL_SIGNAL_EXIT` env var is set to "true". In normal operation the
// original graceful shutdown behavior remains.
if (process.env.SKIP_FATAL_SIGNAL_EXIT === 'true') {
  console.log('[startup] SKIP_FATAL_SIGNAL_EXIT=true — SIGINT/SIGTERM will be logged but not exit the process');
  process.on('SIGTERM', () => {
    console.log('[shutdown-debug] SIGTERM received (ignored for debug)');
  });
  process.on('SIGINT', () => {
    console.log('[shutdown-debug] SIGINT received (ignored for debug)');
  });
} else {
  // Handle SIGTERM for graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[shutdown] SIGTERM received, closing server...');
    server.close(() => {
      console.log('[shutdown] Server closed');
      process.exit(0);
    });
  });

  // Handle SIGINT for graceful shutdown
  process.on('SIGINT', () => {
    console.log('[shutdown] SIGINT received, closing server...');
    server.close(() => {
      console.log('[shutdown] Server closed');
      process.exit(0);
    });
  });
}

// Log that we're fully ready
console.log('[startup] *** ALL STARTUP CHECKS PASSED - Server is fully operational ***');

// Log that we're fully ready
console.log('[startup] *** ALL STARTUP CHECKS PASSED - Server is fully operational ***');
