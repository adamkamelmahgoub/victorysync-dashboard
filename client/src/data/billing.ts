import { buildApiUrl } from '../config';
import type { QueryResult, Package, UserPackage, BillingRecord, Invoice, InvoiceItem, DatabaseError } from './types';

/**
 * Get all available packages
 */
export async function getPackages(userId?: string): Promise<QueryResult<Package>> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/packages'), {
      headers: userId ? { 'x-user-id': userId } : {}
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.packages || [], error: null, count: json.packages?.length || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get packages for a specific user
 */
export async function getUserPackages(userId: string, currentUserId?: string): Promise<QueryResult<UserPackage & { packages?: Package }>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/user-packages?user_id=${encodeURIComponent(userId)}`), {
      headers: currentUserId ? { 'x-user-id': currentUserId } : {}
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.user_packages || [], error: null, count: json.user_packages?.length || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get billing records for an organization
 */
export async function getOrgBillingRecords(orgId: string, limit = 50, userId?: string): Promise<QueryResult<BillingRecord>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/billing/records?org_id=${encodeURIComponent(orgId)}&limit=${limit}`), {
      headers: userId ? { 'x-user-id': userId } : {}
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.records || [], error: null, count: json.records?.length || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get billing records for a user
 */
export async function getUserBillingRecords(userId: string, limit = 50, currentUserId?: string): Promise<QueryResult<BillingRecord>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/billing/records?user_id=${encodeURIComponent(userId)}&limit=${limit}`), {
      headers: currentUserId ? { 'x-user-id': currentUserId } : {}
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.records || [], error: null, count: json.records?.length || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get invoices for an organization
 */
export async function getOrgInvoices(orgId: string, limit = 50, userId?: string): Promise<QueryResult<Invoice & { items?: InvoiceItem[] }>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/billing/invoices?org_id=${encodeURIComponent(orgId)}&limit=${limit}`), {
      headers: userId ? { 'x-user-id': userId } : {}
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const invoices = (json.invoices || []).map((inv: any) => ({
      ...inv,
      items: inv.invoice_items || []
    }));
    return { data: invoices, error: null, count: invoices.length };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get a specific invoice with items
 */
export async function getInvoice(id: string, userId?: string): Promise<QueryResult<Invoice & { items?: InvoiceItem[] }>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/billing/invoices/${encodeURIComponent(id)}`), {
      headers: userId ? { 'x-user-id': userId } : {}
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const invoice = {
      ...json.invoice,
      items: json.invoice.invoice_items || []
    };
    return { data: [invoice], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Create a billing record
 */
export async function createBillingRecord(
  billingRecord: Omit<BillingRecord, 'id' | 'created_at'>,
  userId?: string
): Promise<QueryResult<BillingRecord>> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/billing/records'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(userId && { 'x-user-id': userId }) },
      body: JSON.stringify(billingRecord)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.record], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Create an invoice
 */
export async function createInvoice(
  invoice: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>,
  items: Omit<InvoiceItem, 'id' | 'invoice_id'>[],
  userId?: string
): Promise<QueryResult<Invoice & { items?: InvoiceItem[] }>> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/billing/invoices'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(userId && { 'x-user-id': userId }) },
      body: JSON.stringify({ invoice, items })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [{ ...json.invoice, items: json.invoice.invoice_items || [] }], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Update invoice status
 */
export async function updateInvoiceStatus(
  id: string,
  status: Invoice['status']
): Promise<QueryResult<Invoice>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/billing/invoices/${encodeURIComponent(id)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.invoice], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Assign a package to a user
 */
export async function assignPackageToUser(
  userId: string,
  packageId: string,
  assignedBy: string,
  expiresAt?: string,
  metadata?: Record<string, any>
): Promise<QueryResult<UserPackage>> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/user-packages'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        package_id: packageId,
        assigned_by: assignedBy,
        expires_at: expiresAt,
        metadata: metadata || {}
      })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.user_package], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Get billing summary for an organization
 */
export async function getOrgBillingSummary(orgId: string): Promise<{
  total_billed: number;
  pending_amount: number;
  paid_amount: number;
  overdue_amount: number;
  currency: string;
} | null> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/billing/summary?org_id=${encodeURIComponent(orgId)}`));
    if (!response.ok) return null;
    const json = await response.json();
    return json.summary || null;
  } catch (err) {
    console.error('Error getting billing summary:', err);
    return null;
  }
}