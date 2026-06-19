import { supabaseAdmin } from '../lib/supabaseClient';

export type BillingAccessStatus = {
  locked: boolean;
  reason: string | null;
  orgIds: string[];
  primaryOrgId: string | null;
};

const LOCKING_SUBSCRIPTION_STATUSES = new Set(['past_due', 'unpaid', 'canceled', 'cancelled', 'incomplete_expired']);
const OPEN_INVOICE_STATUSES = new Set(['open', 'sent', 'overdue', 'failed', 'payment_failed']);

export function isBillingLockAllowedPath(pathname: string) {
  if (pathname.startsWith('/billing/stripe')) return true;
  if (pathname.startsWith('/client/billing')) return true;
  if (pathname.startsWith('/user/profile')) return true;
  if (pathname.startsWith('/user/change-password')) return true;
  if (pathname.startsWith('/auth/')) return true;
  if (pathname.startsWith('/logs/')) return true;
  if (pathname === '/csrf-token') return true;
  if (pathname === '/me/features') return true;
  if (pathname.startsWith('/support')) return true;
  return false;
}

function dateIsPast(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed < Date.now();
}

function invoiceAmountDue(row: any) {
  return Number(row?.amount_due ?? row?.balance_due ?? row?.total_amount ?? row?.grand_total ?? row?.total ?? 0);
}

function invoiceAmountPaid(row: any) {
  return Number(row?.amount_paid ?? row?.paid_amount ?? 0);
}

export async function getBillingAccessForOrgIds(orgIds: string[]): Promise<BillingAccessStatus> {
  const scopedOrgIds = Array.from(new Set(orgIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!scopedOrgIds.length) return { locked: false, reason: null, orgIds: [], primaryOrgId: null };

  try {
    const { data } = await supabaseAdmin
      .from('org_billing_locks')
      .select('org_id, locked, reason, locked_until')
      .in('org_id', scopedOrgIds)
      .eq('locked', true);
    const lock = (data || []).find((row: any) => !row.locked_until || dateIsPast(row.locked_until) === false);
    if (lock) {
      return {
        locked: true,
        reason: lock.reason || 'billing_locked',
        orgIds: scopedOrgIds,
        primaryOrgId: lock.org_id || scopedOrgIds[0],
      };
    }
  } catch {
    // Manual lock table is optional until migration is applied.
  }

  try {
    const { data } = await supabaseAdmin
      .from('org_subscriptions')
      .select('org_id, status')
      .in('org_id', scopedOrgIds)
      .order('created_at', { ascending: false });
    const lockedSub = (data || []).find((row: any) => LOCKING_SUBSCRIPTION_STATUSES.has(String(row.status || '').toLowerCase()));
    if (lockedSub) {
      return {
        locked: true,
        reason: `subscription_${String(lockedSub.status || 'inactive').toLowerCase()}`,
        orgIds: scopedOrgIds,
        primaryOrgId: lockedSub.org_id || scopedOrgIds[0],
      };
    }
  } catch {}

  try {
    const { data } = await supabaseAdmin
      .from('invoices')
      .select('org_id, status, due_date, due_at, amount_due, amount_paid, total_amount, grand_total, total')
      .in('org_id', scopedOrgIds)
      .limit(1000);
    const overdue = (data || []).find((row: any) => {
      const status = String(row.status || '').toLowerCase();
      const amountOpen = invoiceAmountDue(row) > invoiceAmountPaid(row);
      return amountOpen && (status === 'overdue' || (OPEN_INVOICE_STATUSES.has(status) && dateIsPast(row.due_date || row.due_at)));
    });
    if (overdue) {
      return {
        locked: true,
        reason: 'invoice_overdue',
        orgIds: scopedOrgIds,
        primaryOrgId: overdue.org_id || scopedOrgIds[0],
      };
    }
  } catch {}

  return { locked: false, reason: null, orgIds: scopedOrgIds, primaryOrgId: scopedOrgIds[0] || null };
}
