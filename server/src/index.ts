// server/src/index.ts
import './config/env';
import express from "express";
import cors from "cors";
import { supabase, supabaseAdmin } from './lib/supabaseClient';
import { fetchMightyCallPhoneNumbers, fetchMightyCallExtensions, syncMightyCallPhoneNumbers } from './integrations/mightycall';
import { isPlatformAdmin, isPlatformManagerWith, isOrgAdmin, isOrgManagerWith } from './auth/rbac';

// Helper to safely format errors for logging (avoids TS property errors)
function fmtErr(e: any) {
  return (e as any)?.message ?? e;
}

const app = express();
app.use(cors());
app.use(express.json());

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
    const orgId = (req.query.org_id as string | undefined) || undefined;

    if (orgId) {
      // Per-org metrics (existing behavior)
      const { data, error } = await supabase
        .from("client_metrics_today")
        .select("*")
        .eq("org_id", orgId)
        .maybeSingle();

      if (error) {
        console.error("Supabase metrics error:", error);
        throw error;
      }

      const metrics = data || {
        org_id: orgId,
        total_calls: 0,
        answered_calls: 0,
        answer_rate_pct: 0,
        avg_wait_seconds: 0,
      };

      return res.json({ metrics });
    } else {
      // Global aggregated metrics across all orgs
      const { data, error } = await supabase
        .from("client_metrics_today")
        .select("total_calls, answered_calls, answer_rate_pct, avg_wait_seconds");

      if (error) {
        console.error("global metrics error:", error);
        return res
          .status(500)
          .json({ error: "metrics_fetch_failed", detail: error.message });
      }

      const rows = data ?? [];

      // Aggregate across all orgs
      let totalCalls = 0;
      let answeredCalls = 0;
      let sumWaitSeconds = 0;
      let waitCount = 0;

      for (const row of rows as any[]) {
        const tc = row.total_calls ?? 0;
        const ac = row.answered_calls ?? 0;
        const aw = row.avg_wait_seconds ?? 0;

        totalCalls += tc;
        answeredCalls += ac;

        if (aw > 0) {
          sumWaitSeconds += aw;
          waitCount += 1;
        }
      }

      const answerRatePct =
        totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

      const avgWaitSeconds =
        waitCount > 0 ? Math.round(sumWaitSeconds / waitCount) : 0;

      const metrics = {
        total_calls: totalCalls,
        answered_calls: answeredCalls,
        answer_rate_pct: answerRatePct,
        avg_wait_seconds: avgWaitSeconds,
      };

      return res.json({ metrics });
    }
  } catch (err: any) {
    console.error("metrics_fetch_failed:", fmtErr(err));
    res.status(500).json({
      error: "metrics_fetch_failed",
      detail: fmtErr(err) ?? "unknown_error",
    });
  }
});

// ============== ADMIN ENDPOINTS ==============

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
    const orgId = req.query.orgId as string | undefined;
    const unassignedOnly = (req.query.unassignedOnly as string | undefined) === 'true';

    let q = supabaseAdmin.from('phone_numbers').select('id, number, e164, number_digits, label, org_id, client_id, is_active').order('created_at', { ascending: true });
    if (unassignedOnly) q = q.is('org_id', null);
    if (orgId) q = q.eq('org_id', orgId);

    const { data, error } = await q;
    if (error) throw error;
    const mapped = (data || []).map((r: any) => ({ id: r.id, number: r.number, label: r.label ?? null, orgId: r.org_id ?? null, isActive: !!r.is_active }));
    res.json({ phone_numbers: mapped });
  } catch (err: any) {
    console.error('list_phone_numbers_failed:', fmtErr(err));
    res.status(500).json({ error: 'list_phone_numbers_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

// DELETE /api/admin/orgs/:orgId/phone-numbers/:phoneNumberId - unassign phone number
app.delete('/api/admin/orgs/:orgId/phone-numbers/:phoneNumberId', async (req, res) => {
  try {
    const userId = req.header('x-user-id') || null;
    const { orgId, phoneNumberId } = req.params;
    if (!orgId || !phoneNumberId) return res.status(400).json({ error: 'missing_required_fields' });

    const allowed =
      (userId && (await isPlatformAdmin(userId))) ||
      (userId && (await isPlatformManagerWith(userId, 'can_manage_phone_numbers_global'))) ||
      (userId && (await isOrgAdmin(userId, orgId))) ||
      (userId && (await isOrgManagerWith(userId, orgId, 'can_manage_phone_numbers')));

    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    // Clear org_id only if it matches provided orgId
    const { error } = await supabaseAdmin
      .from('phone_numbers')
      .update({ org_id: null })
      .eq('id', phoneNumberId)
      .eq('org_id', orgId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error('unassign_phone_failed:', fmtErr(err));
    res.status(500).json({ error: 'unassign_phone_failed', detail: fmtErr(err) ?? 'unknown_error' });
  }
});

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

    if (!orgId || !Array.isArray(phoneNumberIds)) {
      return res.status(400).json({ error: "missing_required_fields", detail: "orgId and phoneNumberIds array required" });
    }

    // Authorization: platform_admin OR platform_manager with global perm OR org_admin OR org_manager with perm
    // In dev mode, allow if userId is present (for testing)
    const isDev = process.env.NODE_ENV !== 'production';
    const allowed =
      (isDev && userId) ||
      (userId && (await isPlatformAdmin(userId))) ||
      (userId && (await isPlatformManagerWith(userId, "can_manage_phone_numbers_global"))) ||
      (userId && (await isOrgAdmin(userId, orgId))) ||
      (userId && (await isOrgManagerWith(userId, orgId, "can_manage_phone_numbers")));

    if (!allowed) return res.status(403).json({ error: "forbidden" });

    const { error } = await supabaseAdmin
      .from("phone_numbers")
      .update({ org_id: orgId })
      .in("id", phoneNumberIds);

    if (error) throw error;
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
    const isDev = process.env.NODE_ENV !== 'production';
    const allowed =
      (isDev && userId) ||
      (userId && (await isPlatformAdmin(userId))) ||
      (userId && (await isPlatformManagerWith(userId, 'can_manage_phone_numbers_global'))) ||
      (userId && (await isOrgAdmin(userId, orgId))) ||
      (userId && (await isOrgManagerWith(userId, orgId, 'can_manage_phone_numbers')));

    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    // Only unassign if it currently belongs to this org (safety)
    const { data: existing, error: getErr } = await supabaseAdmin.from('phone_numbers').select('org_id').eq('id', phoneNumberId).maybeSingle();
    if (getErr) throw getErr;
    if (!existing) return res.status(404).json({ error: 'phone_not_found' });
    if (existing.org_id && existing.org_id !== orgId) return res.status(400).json({ error: 'mismatched_org' });

    const { error } = await supabaseAdmin.from('phone_numbers').update({ org_id: null }).eq('id', phoneNumberId);
    if (error) throw error;

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

    // phones assigned to this org - try multiple schema variants
    let phones: any[] = [];
    // attempt 1: newer schema with `number` column
    try {
      const { data: p1, error: e1 } = await supabaseAdmin
        .from('phone_numbers')
        .select('id, number, label, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });
      if (!e1 && p1) {
        phones = (p1 || []).map((r: any) => ({ id: r.id, number: r.number, label: r.label, created_at: r.created_at }));
      } else {
        throw e1 || new Error('no-data');
      }
    } catch (err1) {
      console.warn('phone_numbers select (number) failed:', fmtErr(err1));
      // attempt 2: legacy column `phone_number`
      try {
        const { data: p2, error: e2 } = await supabaseAdmin
          .from('phone_numbers')
          .select('id, phone_number, label, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: true });
        if (!e2 && p2) {
          phones = (p2 || []).map((r: any) => ({ id: r.id, number: r.phone_number, label: r.label, created_at: r.created_at }));
        } else {
          throw e2 || new Error('no-data');
        }
      } catch (err2) {
        console.warn('phone_numbers select (phone_number) failed:', fmtErr(err2));
        // attempt 3: legacy table name `org_phone_numbers`
        try {
          const { data: p3, error: e3 } = await supabaseAdmin
            .from('org_phone_numbers')
            .select('id, phone_number, label, created_at')
            .eq('org_id', orgId)
            .order('created_at', { ascending: true });
          if (!e3 && p3) {
            phones = (p3 || []).map((r: any) => ({ id: r.id, number: r.phone_number, label: r.label, created_at: r.created_at }));
          } else {
            throw e3 || new Error('no-data');
          }
        } catch (err3) {
          console.warn('org_phone_numbers select failed:', fmtErr(err3));
          phones = [];
        }
      }
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
    const canEditPhoneNumbers = requestUserId
      ? (await isPlatformAdmin(requestUserId)) ||
        (await isPlatformManagerWith(requestUserId, 'can_manage_phone_numbers_global')) ||
        (await isOrgAdmin(requestUserId, orgId)) ||
        (await isOrgManagerWith(requestUserId, orgId, 'can_manage_phone_numbers'))
      : false;

    res.json({ org, members, phones: phones || [], stats: { total_calls: totalCalls, answered_calls: answeredCalls, missed_calls: missedCalls, answer_rate_pct: answerRate }, permissions: { canEditPhoneNumbers } });
  } catch (err: any) {
    console.error('admin_org_detail_failed:', err?.message ?? err);
    res.status(500).json({ error: 'admin_org_detail_failed', detail: err?.message ?? 'unknown_error' });
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
      return res
        .status(500)
        .json({ error: "org_metrics_failed", detail: error.message });
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

    let query = supabaseAdmin
      .from("calls")
      .select("id, direction, from_number, to_number, queue_name, status, started_at")
      .order("started_at", { ascending: false })
      .limit(limit);

    // If org_id is provided, filter by it; otherwise get all orgs
    if (orgId) {
      query = query.eq("org_id", orgId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Map recent calls to frontend-friendly shape: items with camelCase keys
    const items = (data || []).map((c: any) => ({
      id: c.id,
      direction: c.direction,
      status: c.status,
      fromNumber: c.from_number ?? null,
      toNumber: c.to_number ?? null,
      queueName: c.queue_name ?? null,
      startedAt: c.started_at,
      answeredAt: c.answered_at ?? null,
      endedAt: c.ended_at ?? null,
    }));

    res.json({ items });
  } catch (err: any) {
    console.error("calls_recent_failed:", err?.message ?? err);
    res.status(500).json({
      error: "calls_recent_failed",
      detail: err?.message ?? "unknown_error",
    });
  }
});

// GET /api/calls/queue-summary?org_id=...
// Returns queue stats for today (total, answered, missed per queue)
// If org_id is missing, aggregates across all orgs
app.get("/api/calls/queue-summary", async (req, res) => {
  try {
    const orgId = req.query.org_id as string | undefined;
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    let query = supabaseAdmin
      .from("calls")
      .select("queue_name, status")
      .gte("started_at", todayStart);

    // If org_id is provided, filter by it; otherwise get all orgs
    if (orgId) {
      query = query.eq("org_id", orgId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Aggregate by queue
    const queueMap = new Map<
      string | null,
      { name: string | null; total_calls: number; answered_calls: number; missed_calls: number }
    >();

    for (const call of data || []) {
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

    res.json({ queues: mapped });
  } catch (err: any) {
    console.error("queue_summary_failed:", err?.message ?? err);
    res.status(500).json({
      error: "queue_summary_failed",
      detail: err?.message ?? "unknown_error",
    });
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

    // Query calls from public.calls
    let query = supabaseAdmin
      .from("calls")
      .select("started_at, status")
      .gte("started_at", startDate.toISOString())
      .order("started_at", { ascending: true });

    if (orgId) {
      query = query.eq("org_id", orgId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Aggregate into buckets
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

    res.json({ points: mapped });
  } catch (err: any) {
    console.error("calls_series_failed:", err?.message ?? err);
    res.status(500).json({
      error: "calls_series_failed",
      detail: err?.message ?? "unknown_error",
    });
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
app.listen(port, () => {
  console.log(`Metrics API listening on http://localhost:${port}`);
});
