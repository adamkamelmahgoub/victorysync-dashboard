import { supabaseAdmin } from '../lib/supabaseClient';

export const notificationPreferenceKeys = [
  'billing_emails',
  'payment_emails',
  'account_emails',
  'organization_emails',
  'dashboard_update_emails',
  'lead_emails',
  'support_emails',
  'sync_emails',
] as const;

export type NotificationPreferenceKey = typeof notificationPreferenceKeys[number];

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

export const clientAllowedNotificationKeys: NotificationPreferenceKey[] = [
  'billing_emails',
  'payment_emails',
  'account_emails',
  'organization_emails',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanPreferenceEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

export function defaultNotificationPreferences(role?: string | null, globalRole?: string | null): NotificationPreferences {
  const normalizedRole = String(role || '').toLowerCase();
  const normalizedGlobal = String(globalRole || '').toLowerCase();
  const platformAdmin = ['platform_admin', 'super_admin'].includes(normalizedGlobal);
  const elevatedOrg = ['owner', 'admin', 'manager', 'billing'].includes(normalizedRole);
  return {
    billing_emails: true,
    payment_emails: true,
    account_emails: true,
    organization_emails: true,
    dashboard_update_emails: platformAdmin,
    lead_emails: platformAdmin,
    support_emails: platformAdmin || elevatedOrg,
    sync_emails: platformAdmin,
  };
}

export function sanitizePreferencePatch(input: Record<string, unknown>) {
  const patch: Partial<NotificationPreferences> = {};
  for (const key of notificationPreferenceKeys) {
    if (typeof input[key] === 'boolean') patch[key] = input[key] as boolean;
  }
  return patch;
}

export async function getNotificationPreferencesByUserIds(userIds: string[]) {
  const ids = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return new Map<string, any>();
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('*')
    .in('user_id', ids);
  if (error) throw error;
  return new Map((data || []).map((row: any) => [String(row.user_id), row]));
}

export async function getNotificationPreferencesByEmails(emails: string[]) {
  const clean = Array.from(new Set(emails.map(cleanPreferenceEmail).filter(Boolean) as string[]));
  if (!clean.length) return new Map<string, any>();
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('*')
    .in('email', clean);
  if (error) throw error;
  return new Map((data || []).map((row: any) => [String(row.email || '').toLowerCase(), row]));
}

export async function filterEmailsByNotificationPreference(
  emails: string[],
  category: NotificationPreferenceKey,
  fallback = true,
) {
  const clean = Array.from(new Set(emails.map(cleanPreferenceEmail).filter(Boolean) as string[]));
  if (!clean.length) return [];
  try {
    const rows = await getNotificationPreferencesByEmails(clean);
    return clean.filter((email) => {
      const row = rows.get(email);
      if (!row) return fallback;
      return row[category] !== false;
    });
  } catch {
    return fallback ? clean : [];
  }
}

export async function upsertNotificationPreferences(params: {
  userId: string;
  email?: string | null;
  orgId?: string | null;
  patch: Partial<NotificationPreferences>;
}) {
  const payload = {
    user_id: params.userId,
    email: cleanPreferenceEmail(params.email) || null,
    org_id: params.orgId || null,
    ...params.patch,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
