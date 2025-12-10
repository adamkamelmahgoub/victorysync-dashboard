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
import { fetchMightyCallPhoneNumbers, fetchMightyCallExtensions, syncMightyCallPhoneNumbers } from './integrations/mightycall';
import { isPlatformAdmin, isPlatformManagerWith, isOrgAdmin, isOrgManagerWith } from './auth/rbac';

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
    // Fetch mapping rows
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('org_phone_numbers')
      .select('id, org_id, phone_number_id, label, created_at')
      .eq('org_id', orgId);
    if (rowsErr) {
      console.warn('[getAssignedPhoneNumbersForOrg] org_phone_numbers select failed:', fmtErr(rowsErr));
      return { phones: [], numbers: [], digits: [] };
    }

    const rowsArr = (rows || []) as any[];
    console.log('[getAssignedPhoneNumbersForOrg] found', rowsArr.length, 'rows for orgId', orgId);
    
    // Collect phone_number_ids to join to phone_numbers table in bulk
    const phoneIds = rowsArr.filter(r => r.phone_number_id).map(r => r.phone_number_id);
    const phonesById: Record<string, any> = {};
    if (phoneIds.length > 0) {
      const { data: pdata, error: perr } = await supabaseAdmin
        .from('phone_numbers')
        .select('id, number, number_digits, label')
        .in('id', phoneIds as string[]);
      if (!perr && pdata) {
        for (const p of pdata) phonesById[p.id] = p;
      }
    }

    const phones: Array<{ id: string; number: string; number_digits?: string | null; label?: string | null; created_at?: string }> = [];
    for (const r of rowsArr) {
      if (r.phone_number_id && phonesById[r.phone_number_id]) {
        const p = phonesById[r.phone_number_id];
        phones.push({ id: p.id, number: p.number, number_digits: p.number_digits ?? null, label: r.label ?? p.label ?? null, created_at: r.created_at });
      }
    }

    const numbers = phones.map(p => p.number).filter(Boolean);
    const digits = phones.map(p => (p.number_digits || (p.number || '').toString().replace(/\D/g, ''))).filter(Boolean);
    console.log('[getAssignedPhoneNumbersForOrg] returning', phones.length, 'phones for orgId', orgId);
    return { phones, numbers, digits };
  } catch (e) {
    console.warn('[getAssignedPhoneNumbersForOrg] exception:', fmtErr(e));
    return { phones: [], numbers: [], digits: [] };
  }
}

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
// Apply API key middleware early so endpoints can detect org-scoped or platform keys
app.use(apiKeyAuthMiddleware as any);

// Using centralized Supabase client from `src/lib/supabaseClient`

// Simple health check
app.get("/", (_req, res) => {
  res.send("VictorySync metrics API is running");
});

// GET /api/client-metrics?org_id=...
// If org_id is present: returns metrics for that org
// If org_id is missing: returns aggregated metrics across all orgs (for admin global view)
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
          if (assignedNumbers.length > 0) {
            const { data: callsA, error: errA } = await supabaseAdmin
              .from('calls')
              .select('status, started_at, answered_at, to_number')
              .gte('started_at', todayStart)
              .in('to_number', assignedNumbers);
            if (errA) throw errA;
            if (callsA) callsSet.push(...callsA);
          }
          if (assignedDigits.length > 0) {
            const { data: callsB, error: errB } = await supabaseAdmin
              .from('calls')
              .select('status, started_at, answered_at, to_number')
              .gte('started_at', todayStart)
              .in('to_number_digits', assignedDigits);
            if (errB) throw errB;
            if (callsB) callsSet.push(...callsB);
          }
        }
        // Aggregate
        const seen = new Set<string>();
        let totalCalls = 0; let answeredCalls = 0; let waitSum = 0; let waitCount = 0;
        for (const call of callsSet || []) {
          const key = `${call.started_at || ''}::${call.to_number || ''}`;
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

    let q = supabaseAdmin.from('phone_numbers').select('id, number, e164, number_digits, label, org_id, client_id, is_active').order('created_at', { ascending: true });
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

    // Determine whether to use phone_number_id or legacy phone_number column.
    console.log('[assign_phone_numbers] assigning', phoneNumberIds.length, 'phone(s) to org', orgId);
    // Load phone number strings for provided ids to support legacy schema if needed
    const { data: phoneRows } = await supabaseAdmin.from('phone_numbers').select('id, number').in('id', phoneNumberIds as string[]);
    const idToNumber: Record<string, string> = {};
    if (phoneRows && Array.isArray(phoneRows)) {
      for (const p of phoneRows) idToNumber[p.id] = p.number;
    }

    let usedLegacy = false;
    const insertErrors: string[] = [];

    // First attempt: insert using phone_number_id
    for (const phoneId of phoneNumberIds) {
      try {
        const { error: iErr } = await supabaseAdmin
          .from('org_phone_numbers')
          .insert({ org_id: orgId, phone_number_id: phoneId });
        if (iErr) {
          const imsg = (iErr as any)?.message || String(iErr);
          // If column doesn't exist, flag legacy and break to try legacy flow
          if (imsg && imsg.toLowerCase().includes("column \"phone_number_id\"")) {
            console.warn('[assign_phone_numbers] phone_number_id column missing, switching to legacy phone_number column');
            usedLegacy = true;
            break;
          }
          // Duplicate key (already assigned) -> ignore
          if (imsg && (imsg.includes('duplicate key') || imsg.includes('already exists') || imsg.includes('unique constraint'))) {
            console.log('[assign_phone_numbers] phone', phoneId, 'already assigned to org', orgId, '(ignoring)');
            continue;
          }
          console.warn('[assign_phone_numbers] insert error for phone', phoneId, ':', imsg);
          insertErrors.push(imsg);
        }
      } catch (ie) {
        console.warn('[assign_phone_numbers] exception for phone', phoneId, ':', String(ie));
        insertErrors.push(String(ie));
      }
    }

    // If legacy schema detected (no phone_number_id), attempt inserts into phone_number text column
    if (usedLegacy) {
      for (const phoneId of phoneNumberIds) {
        try {
          // Resolve number string: prefer cached mapping, otherwise try to lookup by id or number
          let numberStr = idToNumber[phoneId];
          if (!numberStr) {
            try {
              const { data: pRow, error: pErr } = await supabaseAdmin
                .from('phone_numbers')
                .select('id, number')
                .or(`id.eq.${phoneId},number.eq.${phoneId}`)
                .maybeSingle();
              if (!pErr && pRow && pRow.number) {
                numberStr = pRow.number;
              }
            } catch (e) {
              // ignore lookup error; will handle below
            }
          }

          if (!numberStr) {
            console.warn('[assign_phone_numbers] could not resolve phone number for id or value', phoneId, '; skipping legacy insert');
            insertErrors.push(`unresolved_phone:${phoneId}`);
            continue;
          }

          const { error: liErr } = await supabaseAdmin
            .from('org_phone_numbers')
            .insert({ org_id: orgId, phone_number: numberStr });
          if (liErr) {
            const limsg = (liErr as any)?.message || String(liErr);
            if (limsg && (limsg.includes('duplicate key') || limsg.includes('already exists') || limsg.includes('unique constraint'))) {
              console.log('[assign_phone_numbers] legacy phone', numberStr, 'already assigned to org', orgId, '(ignoring)');
              continue;
            }
            console.warn('[assign_phone_numbers] legacy insert error for phone', numberStr, ':', limsg);
            insertErrors.push(limsg);
          }
        } catch (lie) {
          console.warn('[assign_phone_numbers] legacy exception for phone', phoneId, ':', String(lie));
          insertErrors.push(String(lie));
        }
      }
    }

    if (insertErrors.length > 0) {
      console.warn('[assign_phone_numbers] some inserts failed:', insertErrors.slice(0, 5));
    }
    res.json({ success: true });
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
    try {
      // Try to find by phone_number_id first
      const { data: rowsById, error: fetchByIdErr } = await supabaseAdmin
        .from('org_phone_numbers')
        .select('id')
        .eq('org_id', orgId)
        .eq('phone_number_id', phoneNumberId);
      
      if (!fetchByIdErr && rowsById && rowsById.length > 0) {
        // Delete by row id (most reliable)
        for (const row of rowsById) {
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

    if (deletedCount === 0) {
      return res.status(404).json({ error: 'phone_number_not_found_for_org' });
    }

    res.status(204).send();
  } catch (err: any) {
    console.error('unassign_phone_failed:', fmtErr(err));
    res.status(500).json({ error: 'unassign_phone_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// POST /api/admin/mightycall/sync - fetch from MightyCall and upsert phone numbers + extensions
app.post('/api/admin/mightycall/sync', async (_req, res) => {
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
  } catch (err: any) {
    console.error('mightycall_sync_failed:', fmtErr(err));
    res.status(500).json({ error: 'mightycall_sync_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// GET /api/admin/orgs/:orgId - detailed org info: members (with email), phones, stats
app.get('/api/admin/orgs/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select('id, name, created_at')
      .eq('id', orgId)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) return res.status(404).json({ error: 'org_not_found' });

    // members from `org_users` (canonical in this deployment)
    const { data: memberships, error: memErr } = await supabaseAdmin
      .from('org_users')
      .select('id, org_id, user_id, role, mightycall_extension, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (memErr) throw memErr;

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

    // Fetch calls that match either E.164 `to_number` or digit-only `to_number_digits`
    const callsSet: any[] = [];
    if (assignedNumbers.length > 0) {
      const { data: callsA, error: errA } = await supabaseAdmin.from('calls').select('status, to_number, started_at').gte('started_at', todayStart).in('to_number', assignedNumbers);
      if (errA) throw errA;
      if (callsA) callsSet.push(...callsA);
    }
    if (assignedDigits.length > 0) {
      const { data: callsB, error: errB } = await supabaseAdmin.from('calls').select('status, to_number, started_at').gte('started_at', todayStart).in('to_number_digits', assignedDigits);
      if (errB) throw errB;
      if (callsB) callsSet.push(...callsB);
    }

    // Deduplicate calls by a composite key (started_at + to_number)
    const seen = new Set<string>();
    let totalCalls = 0; let answeredCalls = 0; let missedCalls = 0;
    for (const call of callsSet || []) {
      const key = `${call.started_at || ''}::${call.to_number || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const st = (call.status || '').toString().toLowerCase();
      totalCalls += 1;
      if (st === 'answered' || st === 'completed') answeredCalls += 1;
      else if (st === 'missed') missedCalls += 1;
    }
    const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

    // Determine if requesting user can edit phone numbers
    const requestUserId = req.header('x-user-id') || null;
    const isDev = process.env.NODE_ENV !== 'production';
    const canEditPhoneNumbers = !requestUserId ? false : 
      (isDev) || // Allow in dev if userId provided
      (await isPlatformAdmin(requestUserId)) ||
      (await isPlatformManagerWith(requestUserId, 'can_manage_phone_numbers_global')) ||
      (await isOrgAdmin(requestUserId, orgId)) ||
      (await isOrgManagerWith(requestUserId, orgId, 'can_manage_phone_numbers'));

    res.json({ org, members, phones: phones || [], stats: { total_calls: totalCalls, answered_calls: answeredCalls, missed_calls: missedCalls, answer_rate_pct: answerRate }, permissions: { canEditPhoneNumbers } });
  } catch (err: any) {
    console.error('admin_org_detail_failed:', err?.message ?? err);
    res.status(500).json({ error: 'admin_org_detail_failed', detail: err?.message ?? 'unknown_error' });
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

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        org_id: orgId,
        role: role || "agent",
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
        role: role || "agent",
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

const port = Number(process.env.PORT) || 4000;
const serverHost = process.env.API_BASE_URL || process.env.SERVER_BASE_URL || null;
app.listen(port, '0.0.0.0', () => {
  if (serverHost) {
    console.log(`Metrics API listening (configured host): ${serverHost}`);
  } else {
    console.log(`Metrics API listening on port ${port}`);
  }
}).on('error', (err: any) => {
  console.error(`Failed to listen on port ${port}:`, err.message);
  process.exit(1);
});
