import { buildApiUrl } from '../config';
import type { QueryResult, OrgMember, OrgManagerPermission, DatabaseError } from './types';

/**
 * Get all members for an organization
 */
export async function getOrgMembers(orgId: string): Promise<QueryResult<OrgMember & { user_email?: string; user_name?: string }>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/orgs/${encodeURIComponent(orgId)}/members`));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const members = (json.members || []).map((m: any) => ({
      ...m,
      user_email: m.email,
      user_name: m.name
    }));
    return { data: members, error: null, count: members.length };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: 0
    };
  }
}

/**
 * Get a specific org member by ID
 */
export async function getOrgMember(id: string): Promise<QueryResult<OrgMember & { user_email?: string; user_name?: string }>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/org-members/${encodeURIComponent(id)}`));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const member = {
      ...json.member,
      user_email: json.member.email,
      user_name: json.member.name
    };
    return { data: [member], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Add a member to an organization
 */
export async function addOrgMember(
  orgId: string,
  userId: string,
  role: OrgMember['role'] = 'agent',
  mightycallExtension?: string
): Promise<QueryResult<OrgMember>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/orgs/${encodeURIComponent(orgId)}/members`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        role,
        mightycall_extension: mightycallExtension
      })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.member], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Update an org member's role and permissions
 */
export async function updateOrgMember(
  id: string,
  updates: Partial<Pick<OrgMember, 'role' | 'mightycall_extension'>>
): Promise<QueryResult<OrgMember>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/org-members/${encodeURIComponent(id)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.member], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Remove a member from an organization
 */
export async function removeOrgMember(id: string): Promise<{ error: DatabaseError | null }> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/org-members/${encodeURIComponent(id)}`), {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { error: null };
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}

/**
 * Get org manager permissions for a member
 */
export async function getOrgManagerPermissions(orgMemberId: string): Promise<QueryResult<OrgManagerPermission>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/org-members/${encodeURIComponent(orgMemberId)}/permissions`));
    if (!response.ok) {
      if (response.status === 404) return { data: [], error: null };
      throw new Error(`HTTP ${response.status}`);
    }
    const json = await response.json();
    return { data: [json.permissions], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Update org manager permissions
 */
export async function updateOrgManagerPermissions(
  orgMemberId: string,
  permissions: Partial<Pick<OrgManagerPermission, 'can_manage_agents' | 'can_manage_phone_numbers' | 'can_edit_service_targets' | 'can_view_billing'>>
): Promise<QueryResult<OrgManagerPermission>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/org-members/${encodeURIComponent(orgMemberId)}/permissions`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(permissions)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.permissions], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Get team members with their call metrics for today
 */
export async function getTeamMembersWithMetrics(orgId: string): Promise<QueryResult<OrgMember & { user_email?: string; user_name?: string; today_calls?: number; today_duration?: number }>> {
  try {
    // First get team members
    const membersResult = await getOrgMembers(orgId);
    if (membersResult.error || !membersResult.data) {
      return membersResult;
    }

    const members = membersResult.data;

    // Get today's metrics for each member (if they have extensions)
    const extensions = members
      .map(m => m.mightycall_extension)
      .filter(Boolean) as string[];

    if (extensions.length === 0) {
      return { data: members.map(m => ({ ...m, today_calls: 0, today_duration: 0 })), error: null, count: members.length };
    }

    const url = new URL(buildApiUrl('/api/admin/metrics/agents-today'));
    url.searchParams.append('extensions', extensions.join(','));
    
    const response = await fetch(url.toString());
    if (!response.ok) {
      // Return members without metrics rather than failing completely
      return { data: members.map(m => ({ ...m, today_calls: 0, today_duration: 0 })), error: null, count: members.length };
    }

    const json = await response.json();
    const metrics = json.data || [];

    // Merge metrics with members
    const membersWithMetrics = members.map(member => {
      const memberMetrics = metrics.find((m: any) => m.extension === member.mightycall_extension);
      return {
        ...member,
        today_calls: memberMetrics?.total_calls || 0,
        today_duration: memberMetrics?.total_duration_seconds || 0
      };
    });

    return { data: membersWithMetrics, error: null, count: members.length };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}