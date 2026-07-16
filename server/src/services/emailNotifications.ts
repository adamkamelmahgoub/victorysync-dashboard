import fetch from 'node-fetch';
import { supabaseAdmin } from '../lib/supabaseClient';
import { filterEmailsByNotificationPreference, type NotificationPreferenceKey } from './notificationPreferences';

type EmailPayload = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

type DetailValue = string | number | null | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function enabled() {
  return String(process.env.EMAIL_NOTIFICATIONS_ENABLED || '').toLowerCase() === 'true';
}

function appUrl(path = '/') {
  const base = process.env.EMAIL_APP_URL || process.env.STRIPE_APP_URL || process.env.FRONTEND_ORIGIN || 'https://dashboard.victorysync.com';
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function escapeHtml(value: DetailValue) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

function uniqueEmails(values: unknown[]) {
  return Array.from(new Set(values.map(cleanEmail).filter(Boolean) as string[])).slice(0, 40);
}

function configuredAdminEmails() {
  return uniqueEmails(String(process.env.EMAIL_ADMIN_TO || '')
    .split(',')
    .map((email) => email.trim()));
}

async function emailsFromAuthIds(userIds: string[]) {
  const emails: string[] = [];
  for (const userId of userIds.slice(0, 40)) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (data?.user?.email) emails.push(data.user.email);
    } catch {
      // Best-effort recipient lookup only.
    }
  }
  return emails;
}

export async function getPlatformAdminEmails() {
  const recipients = configuredAdminEmails();
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, email, global_role, role')
      .in('global_role', ['platform_admin', 'super_admin']);
    recipients.push(...((data || []) as any[]).map((row) => row.email));
    recipients.push(...await emailsFromAuthIds(((data || []) as any[]).map((row) => String(row.id || '')).filter(Boolean)));
  } catch {
    // Some installs do not have global_role on profiles yet.
  }
  return uniqueEmails(recipients);
}

export async function getOrgBillingRecipientEmails(orgId: string | null | undefined) {
  if (!orgId) return getPlatformAdminEmails();
  const recipients: string[] = [];
  const userIds: string[] = [];

  try {
    const { data } = await supabaseAdmin
      .from('org_members')
      .select('user_id, email, role')
      .eq('org_id', orgId);
    for (const row of (data || []) as any[]) {
      if (row.email) recipients.push(row.email);
      if (row.user_id && ['owner', 'admin', 'manager', 'billing'].includes(String(row.role || '').toLowerCase())) {
        userIds.push(String(row.user_id));
      }
    }
  } catch {
    // org_members is optional in older schemas.
  }

  try {
    const { data } = await supabaseAdmin
      .from('org_users')
      .select('user_id, email, role')
      .eq('org_id', orgId);
    for (const row of (data || []) as any[]) {
      if (row.email) recipients.push(row.email);
      if (row.user_id && ['owner', 'admin', 'manager', 'billing'].includes(String(row.role || '').toLowerCase())) {
        userIds.push(String(row.user_id));
      }
    }
  } catch {
    // org_users may not expose email in all schemas.
  }

  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length) {
    try {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, email')
        .in('id', ids);
      recipients.push(...((data || []) as any[]).map((row) => row.email));
    } catch {
      // Continue with auth lookup.
    }
    recipients.push(...await emailsFromAuthIds(ids));
  }

  recipients.push(...await getPlatformAdminEmails());
  return uniqueEmails(recipients);
}

function renderNotificationEmail(params: {
  eyebrow: string;
  title: string;
  intro: string;
  details?: Record<string, DetailValue>;
  actionLabel?: string;
  actionUrl?: string;
}) {
  const rows = Object.entries(params.details || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `
      <tr>
        <td style="padding:8px 0;color:#4b5563;font-size:13px;">${escapeHtml(label)}</td>
        <td style="padding:8px 0;color:#111827;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(value)}</td>
      </tr>
    `)
    .join('');

  const action = params.actionUrl
    ? `<a href="${escapeHtml(params.actionUrl)}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:700;font-size:14px;">${escapeHtml(params.actionLabel || 'Open dashboard')}</a>`
    : '';

  const html = `
    <div style="margin:0;background:#f6f7f9;padding:28px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 14px 40px rgba(15,23,42,0.08);overflow:hidden;">
        <div style="padding:24px 26px;border-bottom:1px solid #eef2f7;">
          <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6d28d9;">${escapeHtml(params.eyebrow)}</div>
          <h1 style="margin:10px 0 0;font-size:22px;line-height:1.3;color:#111827;">${escapeHtml(params.title)}</h1>
        </div>
        <div style="padding:24px 26px;">
          <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7;">${escapeHtml(params.intro)}</p>
          ${rows ? `<table style="width:100%;border-collapse:collapse;margin:14px 0 22px;">${rows}</table>` : ''}
          ${action}
        </div>
        <div style="padding:16px 26px;background:#f9fafb;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;line-height:1.6;">
          This notification was sent by VictorySync. Payment details are handled by Stripe and are never included in this email.
        </div>
      </div>
    </div>
  `;

  const text = [
    params.title,
    '',
    params.intro,
    '',
    ...Object.entries(params.details || {})
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
      .map(([label, value]) => `${label}: ${value}`),
    params.actionUrl ? `Open dashboard: ${params.actionUrl}` : '',
  ].filter(Boolean).join('\n');

  return { html, text };
}

export async function sendEmail(payload: EmailPayload) {
  if (!enabled()) return { skipped: true, reason: 'email_notifications_disabled' };
  const to = uniqueEmails(payload.to);
  if (!to.length) return { skipped: true, reason: 'no_recipients' };

  const provider = String(process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
  const from = process.env.EMAIL_FROM || 'VictorySync <notifications@victorysync.com>';
  const replyTo = payload.replyTo || process.env.EMAIL_REPLY_TO || undefined;

  if (provider !== 'resend') {
    console.warn('[email] unsupported provider configured; skipping notification');
    return { skipped: true, reason: 'unsupported_provider' };
  }

  const apiKey = process.env.RESEND_API_KEY || '';
  if (!apiKey) return { skipped: true, reason: 'resend_api_key_missing' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: replyTo,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn('[email] send failed:', response.status, body.slice(0, 160));
    return { skipped: true, reason: 'provider_error' };
  }
  return { sent: true };
}

async function notifyRecipients(to: string[], params: Parameters<typeof renderNotificationEmail>[0] & { subject: string }) {
  const rendered = renderNotificationEmail(params);
  try {
    return await sendEmail({
      to,
      subject: params.subject,
      html: rendered.html,
      text: rendered.text,
    });
  } catch (err: any) {
    console.warn('[email] notification skipped:', String(err?.message || err).slice(0, 160));
    return { skipped: true, reason: 'send_exception' };
  }
}

async function notifyRecipientsForCategory(
  to: string[],
  category: NotificationPreferenceKey,
  params: Parameters<typeof renderNotificationEmail>[0] & { subject: string },
  fallback = true,
) {
  const filtered = await filterEmailsByNotificationPreference(to, category, fallback);
  return notifyRecipients(filtered, params);
}

function money(currency: string | null | undefined, amount: unknown) {
  return `${String(currency || 'USD').toUpperCase()} ${Number(amount || 0).toFixed(2)}`;
}

function invoiceTotal(invoice: any) {
  const header = Number(invoice?.amount_due ?? invoice?.total_amount ?? invoice?.grand_total ?? invoice?.total ?? 0);
  if (header > 0) return header;
  return ((invoice?.invoice_items || invoice?.items || []) as any[]).reduce((sum, item) => {
    const explicit = Number(item?.line_total ?? item?.total_price ?? item?.total ?? 0);
    return sum + (explicit > 0 ? explicit : (Number(item?.quantity || 0) || 0) * (Number(item?.unit_price || 0) || 0));
  }, 0);
}

export async function notifyInvoiceCreated(invoice: any) {
  const total = invoiceTotal(invoice);
  const recipients = await getOrgBillingRecipientEmails(invoice?.org_id);
  return notifyRecipientsForCategory(recipients, 'billing_emails', {
    subject: `New VictorySync invoice ${invoice?.invoice_number || ''}`.trim(),
    eyebrow: 'Billing update',
    title: 'A new invoice is available',
    intro: 'A VictorySync invoice has been created. You can review it in the dashboard and pay securely through Stripe if payment is due.',
    details: {
      Invoice: invoice?.invoice_number || invoice?.id,
      Status: invoice?.status || 'draft',
      Amount: money(invoice?.currency, total),
      Due: invoice?.due_date || invoice?.due_at || 'Not set',
    },
    actionLabel: 'View billing',
    actionUrl: appUrl('/billing'),
  });
}

export async function notifyPaymentReminder(invoice: any) {
  const total = invoiceTotal(invoice);
  const recipients = await getOrgBillingRecipientEmails(invoice?.org_id);
  return notifyRecipientsForCategory(recipients, 'payment_emails', {
    subject: `Payment reminder: ${invoice?.invoice_number || 'VictorySync invoice'}`,
    eyebrow: 'Payment reminder',
    title: 'Invoice payment reminder',
    intro: 'This is a reminder that an invoice is still open. Payments are handled securely through Stripe from the VictorySync billing page.',
    details: {
      Invoice: invoice?.invoice_number || invoice?.id,
      Status: invoice?.status || 'open',
      Amount: money(invoice?.currency, total),
      Due: invoice?.due_date || invoice?.due_at || 'Not set',
    },
    actionLabel: 'Pay securely',
    actionUrl: appUrl('/billing'),
  });
}

export async function notifyPaymentSucceeded(params: {
  orgId: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  amount?: number | null;
  currency?: string | null;
}) {
  const recipients = await getOrgBillingRecipientEmails(params.orgId);
  return notifyRecipientsForCategory(recipients, 'payment_emails', {
    subject: 'VictorySync payment received',
    eyebrow: 'Payment received',
    title: 'Payment received successfully',
    intro: 'A Stripe payment was completed and synced back to VictorySync.',
    details: {
      Invoice: params.invoiceNumber || params.invoiceId || 'Stripe invoice',
      Amount: money(params.currency, params.amount),
      Status: 'Paid',
    },
    actionLabel: 'View billing',
    actionUrl: appUrl('/billing'),
  });
}

export async function notifyPaymentFailed(params: {
  orgId: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  amount?: number | null;
  currency?: string | null;
}) {
  const recipients = await getOrgBillingRecipientEmails(params.orgId);
  return notifyRecipientsForCategory(recipients, 'payment_emails', {
    subject: 'VictorySync payment needs attention',
    eyebrow: 'Payment failed',
    title: 'A Stripe payment failed',
    intro: 'Stripe reported a failed payment. The customer can update their payment method or retry payment from the billing page.',
    details: {
      Invoice: params.invoiceNumber || params.invoiceId || 'Stripe invoice',
      Amount: money(params.currency, params.amount),
      Status: 'Failed',
    },
    actionLabel: 'Manage billing',
    actionUrl: appUrl('/billing'),
  });
}

export async function notifySubscriptionChanged(params: {
  orgId: string;
  status?: string | null;
  planName?: string | null;
  eventType?: string | null;
}) {
  const recipients = await getOrgBillingRecipientEmails(params.orgId);
  return notifyRecipientsForCategory(recipients, 'billing_emails', {
    subject: 'VictorySync subscription updated',
    eyebrow: 'Subscription update',
    title: 'Subscription status changed',
    intro: 'A Stripe subscription update was received and synced to VictorySync.',
    details: {
      Event: params.eventType || 'subscription.updated',
      Plan: params.planName || 'Not specified',
      Status: params.status || 'Updated',
    },
    actionLabel: 'View billing',
    actionUrl: appUrl('/billing'),
  });
}

async function getUserAccountEmail(userId: string | null | undefined) {
  if (!userId) return null;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (data?.user?.email) return cleanEmail(data.user.email);
  } catch {
    // Fall back to profile email below.
  }
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
    return cleanEmail((data as any)?.email);
  } catch {
    return null;
  }
}

type SecurityEventDetails = {
  userId: string;
  ipAddress?: string | null;
  location?: string | null;
  userAgent?: string | null;
  occurredAt?: string | null;
  method?: string | null;
  updateType?: string | null;
};

export async function notifyUserLogin(params: SecurityEventDetails) {
  const recipient = await getUserAccountEmail(params.userId);
  if (!recipient) return { skipped: true, reason: 'user_email_not_found' };
  return notifyRecipientsForCategory([recipient], 'account_emails', {
    subject: 'New VictorySync login',
    eyebrow: 'Account security',
    title: 'New login to your VictorySync account',
    intro: 'A new login to your VictorySync account was completed. If this was not you, change your password and contact your VictorySync administrator.',
    details: {
      Time: params.occurredAt || new Date().toISOString(),
      'IP address': params.ipAddress || 'Unavailable',
      Location: params.location || 'Unavailable',
      Method: params.method || 'Password sign-in',
      Device: params.userAgent || 'Unavailable',
    },
    actionLabel: 'Review account settings',
    actionUrl: appUrl('/settings'),
  });
}

export async function notifyUserAccountUpdate(_params: SecurityEventDetails) {
  return { skipped: true, reason: 'routine_email_disabled' };
}

function shouldNotifyDashboardUpdates() {
  return false;
}

export async function notifyDashboardUpdate(params: {
  actorId?: string | null;
  method: string;
  path: string;
  orgId?: string | null;
  statusCode?: number;
}) {
  if (!shouldNotifyDashboardUpdates()) return { skipped: true, reason: 'dashboard_update_notifications_disabled' };
  const recipients = await getPlatformAdminEmails();
  return notifyRecipientsForCategory(recipients, 'dashboard_update_emails', {
    subject: `VictorySync update: ${params.method} ${params.path}`,
    eyebrow: 'Dashboard update',
    title: 'Dashboard data was updated',
    intro: 'A dashboard update was completed. This email includes only safe operational metadata, not request payloads or secrets.',
    details: {
      Method: params.method,
      Path: params.path,
      Status: params.statusCode || 200,
      Actor: params.actorId || 'Authenticated user',
      Organization: params.orgId || 'Not specified',
    },
    actionLabel: 'Open dashboard',
    actionUrl: appUrl('/'),
  });
}
