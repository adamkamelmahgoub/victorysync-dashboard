import express from 'express';
import { z } from 'zod';
import { isPlatformAdmin } from '../auth/rbac';
import { supabaseAdmin } from '../lib/supabaseClient';
import {
  defaultNotificationPreferences,
  getNotificationPreferencesByUserIds,
  notificationPreferenceKeys,
  sanitizePreferencePatch,
  upsertNotificationPreferences,
} from '../services/notificationPreferences';

const router = express.Router();

const updateSchema = z.object({
  billing_emails: z.boolean().optional(),
  payment_emails: z.boolean().optional(),
  account_emails: z.boolean().optional(),
  organization_emails: z.boolean().optional(),
  dashboard_update_emails: z.boolean().optional(),
  lead_emails: z.boolean().optional(),
  support_emails: z.boolean().optional(),
  sync_emails: z.boolean().optional(),
}).strict();

function actorId(req: express.Request) {
  const id = (req as any).actorId || req.header('x-user-id') || '';
  if (!id) {
    const err = new Error('unauthenticated') as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return String(id);
}

async function loadProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, role, global_role')
    .eq('id', userId)
    .maybeSingle();
  return data as any;
}

async function loadOrgMembership(userId: string) {
  const [orgUsers, orgMembers] = await Promise.all([
    Promise.resolve(supabaseAdmin.from('org_users').select('org_id, role, email').eq('user_id', userId).limit(1))
      .then((r) => (r.data || [])[0])
      .catch(() => null),
    Promise.resolve(supabaseAdmin.from('org_members').select('org_id, role, email').eq('user_id', userId).limit(1))
      .then((r) => (r.data || [])[0])
      .catch(() => null),
  ]);
  return (orgUsers || orgMembers || null) as any;
}

function mergePreferenceRow(user: any, saved: any) {
  const defaults = defaultNotificationPreferences(user.role, user.global_role);
  return {
    user_id: user.id,
    email: user.email || saved?.email || null,
    name: user.name || user.full_name || null,
    role: user.role || 'member',
    global_role: user.global_role || null,
    org_id: user.org_id || saved?.org_id || null,
    storage_available: true,
    ...defaults,
    ...(saved || {}),
  };
}

async function listKnownUsers() {
  const users = new Map<string, any>();

  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, global_role')
      .limit(1000);
    for (const row of (data || []) as any[]) {
      if (!row.id) continue;
      users.set(String(row.id), {
        id: String(row.id),
        email: row.email || null,
        name: row.full_name || null,
        role: row.role || 'member',
        global_role: row.global_role || null,
      });
    }
  } catch {
    // Profiles table may be partial in older installs.
  }

  for (const table of ['org_users', 'org_members']) {
    try {
      const { data } = await supabaseAdmin
        .from(table)
        .select('user_id, email, role, org_id')
        .limit(2000);
      for (const row of (data || []) as any[]) {
        const id = String(row.user_id || '').trim();
        if (!id) continue;
        users.set(id, {
          ...(users.get(id) || { id }),
          email: users.get(id)?.email || row.email || null,
          role: row.role || users.get(id)?.role || 'member',
          org_id: row.org_id || users.get(id)?.org_id || null,
        });
      }
    } catch {
      // Optional membership table.
    }
  }

  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const authUser of data?.users || []) {
      users.set(authUser.id, {
        ...(users.get(authUser.id) || { id: authUser.id }),
        email: users.get(authUser.id)?.email || authUser.email || null,
        name: users.get(authUser.id)?.name || authUser.user_metadata?.full_name || null,
      });
    }
  } catch {
    // Auth listing is best effort.
  }

  return Array.from(users.values()).sort((a, b) => String(a.email || a.id).localeCompare(String(b.email || b.id)));
}

router.get('/notification-preferences/me', async (req, res) => {
  try {
    const userId = actorId(req);
    const profile = await loadProfile(userId);
    const membership = await loadOrgMembership(userId);
    const saved = (await getNotificationPreferencesByUserIds([userId])).get(userId);
    res.json({
      item: mergePreferenceRow({
        id: userId,
        email: profile?.email || membership?.email || null,
        name: profile?.full_name || null,
        role: membership?.role || profile?.role || 'member',
        global_role: profile?.global_role || null,
        org_id: membership?.org_id || null,
      }, saved),
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'notification_preferences_failed' });
  }
});

router.put('/notification-preferences/me', async (req, res) => {
  try {
    const userId = actorId(req);
    const parsed = updateSchema.parse(req.body || {});
    const profile = await loadProfile(userId);
    const membership = await loadOrgMembership(userId);
    const data = await upsertNotificationPreferences({
      userId,
      email: profile?.email || membership?.email || null,
      orgId: membership?.org_id || null,
      patch: sanitizePreferencePatch(parsed),
    });
    res.json({ item: data });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'notification_preferences_update_failed' });
  }
});

router.get('/admin/notification-preferences', async (req, res) => {
  try {
    const userId = actorId(req);
    if (!(await isPlatformAdmin(userId))) return res.status(403).json({ error: 'forbidden' });
    const users = await listKnownUsers();
    const saved = await getNotificationPreferencesByUserIds(users.map((user) => user.id));
    res.json({
      items: users.map((user) => mergePreferenceRow(user, saved.get(user.id))),
      categories: notificationPreferenceKeys,
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'admin_notification_preferences_failed' });
  }
});

router.put('/admin/notification-preferences/:userId', async (req, res) => {
  try {
    const adminId = actorId(req);
    if (!(await isPlatformAdmin(adminId))) return res.status(403).json({ error: 'forbidden' });
    const targetUserId = String(req.params.userId || '').trim();
    if (!targetUserId) return res.status(400).json({ error: 'missing_user_id' });
    const parsed = updateSchema.parse(req.body || {});
    const profile = await loadProfile(targetUserId);
    const membership = await loadOrgMembership(targetUserId);
    const data = await upsertNotificationPreferences({
      userId: targetUserId,
      email: profile?.email || membership?.email || null,
      orgId: membership?.org_id || null,
      patch: sanitizePreferencePatch(parsed),
    });
    res.json({ item: data });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'admin_notification_preferences_update_failed' });
  }
});

export default router;
