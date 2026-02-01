import { buildApiUrl } from '../config';
import type { QueryResult, Organization, Package, UserPackage, BillingRecord, SupportTicket, AuditLog, DatabaseError } from './types';

/**
 * Get all organizations (admin only)
 */
export async function getAllOrganizations(limit = 100, offset = 0, userId?: string): Promise<QueryResult<Organization>> {
  try {
    const url = new URL(buildApiUrl('/api/admin/orgs'));
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('offset', offset.toString());
    
    const response = await fetch(url.toString(), {
      headers: userId ? { 'x-user-id': userId } : {}
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.organizations || [], error: null, count: json.count || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get organization with member counts
 */
export async function getOrganizationsWithCounts(limit = 100, userId?: string): Promise<QueryResult<Organization & { member_count?: number; phone_count?: number }>> {
  try {
    const url = new URL(buildApiUrl('/api/admin/orgs'));
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('with_counts', 'true');
    
    const response = await fetch(url.toString(), {
      headers: userId ? { 'x-user-id': userId } : {}
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.organizations || [], error: null, count: json.count || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Create a new organization
 */
export async function createOrganization(
  org: Omit<Organization, 'id' | 'created_at' | 'updated_at'>,
  userId?: string
): Promise<QueryResult<Organization>> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/orgs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(userId && { 'x-user-id': userId }) },
      body: JSON.stringify(org)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.organization], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Update an organization
 */
export async function updateOrganization(
  id: string,
  updates: Partial<Pick<Organization, 'name' | 'timezone' | 'sla_target_percent' | 'sla_target_seconds' | 'business_hours' | 'escalation_email'>>,
  userId?: string
): Promise<QueryResult<Organization>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/orgs/${encodeURIComponent(id)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(userId && { 'x-user-id': userId }) },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.organization], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Get all packages (admin only)
 */
export async function getAllPackages(userId?: string): Promise<QueryResult<Package>> {
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
 * Create a new package
 */
export async function createPackage(
  pkg: Omit<Package, 'id' | 'created_at' | 'updated_at'>,
  userId?: string
): Promise<QueryResult<Package>> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/packages'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(userId && { 'x-user-id': userId }) },
      body: JSON.stringify(pkg)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.package], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Update a package
 */
export async function updatePackage(
  id: string,
  updates: Partial<Pick<Package, 'name' | 'description' | 'features' | 'pricing' | 'is_active'>>,
  userId?: string
): Promise<QueryResult<Package>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/packages/${encodeURIComponent(id)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(userId && { 'x-user-id': userId }) },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.package], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Get all user packages (admin only)
 */
export async function getAllUserPackages(limit = 200, offset = 0): Promise<QueryResult<UserPackage & { packages?: Package; user_email?: string; org_name?: string }>> {
  try {
    const url = new URL(buildApiUrl('/api/admin/user-packages'));
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('offset', offset.toString());
    
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.user_packages || [], error: null, count: json.count || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get all billing records (admin only)
 */
export async function getAllBillingRecords(limit = 500, offset = 0): Promise<QueryResult<BillingRecord & { org_name?: string; user_email?: string }>> {
  try {
    const url = new URL(buildApiUrl('/api/admin/billing/records'));
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('offset', offset.toString());
    
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.records || [], error: null, count: json.count || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get support tickets (admin only)
 */
export async function getSupportTickets(status?: SupportTicket['status'], limit = 100): Promise<QueryResult<SupportTicket & { user_email?: string; org_name?: string }>> {
  try {
    const url = new URL(buildApiUrl('/api/admin/support/tickets'));
    url.searchParams.append('limit', limit.toString());
    if (status) url.searchParams.append('status', status);
    
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.tickets || [], error: null, count: json.count || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Update support ticket status
 */
export async function updateSupportTicket(
  id: string,
  updates: Partial<Pick<SupportTicket, 'status' | 'priority' | 'assigned_to' | 'resolution'>>
): Promise<QueryResult<SupportTicket>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/support/tickets/${encodeURIComponent(id)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.ticket], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Get audit logs (admin only)
 */
export async function getAuditLogs(
  limit = 500,
  offset = 0,
  orgId?: string,
  action?: string
): Promise<QueryResult<AuditLog & { user_email?: string; org_name?: string }>> {
  try {
    const url = new URL(buildApiUrl('/api/admin/audit-logs'));
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('offset', offset.toString());
    if (orgId) url.searchParams.append('org_id', orgId);
    if (action) url.searchParams.append('action', action);
    
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.logs || [], error: null, count: json.count || 0 };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(
  log: Omit<AuditLog, 'id' | 'created_at'>
): Promise<QueryResult<AuditLog>> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/audit-logs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.log], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Get platform statistics
 */
export async function getPlatformStats(): Promise<{
  total_organizations: number;
  total_users: number;
  total_phone_numbers: number;
  total_billing_amount: number;
  active_support_tickets: number;
} | null> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/stats'));
    if (!response.ok) return null;
    const json = await response.json();
    return json.stats || null;
  } catch (err) {
    console.error('Error getting platform stats:', err);
    return null;
  }
}