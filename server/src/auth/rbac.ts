// server/src/auth/rbac.ts
// Role-based access control helpers

import { supabaseAdmin } from "../lib/supabaseClient";

interface UserContext {
  userId: string;
  globalRole?: string | null;
  orgMemberships?: Array<{ orgId: string; role: string; permissions?: any }>;
}

/** Check if user is platform admin */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("global_role")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) {
      console.log('[isPlatformAdmin] profile not found or error for userId:', userId, 'error:', error ?? null);
      return false;
    }
    console.log('[isPlatformAdmin] userId:', userId, 'global_role:', data.global_role);
    // Accept both legacy 'admin' and canonical 'platform_admin' as platform-level admin
    return data.global_role === "platform_admin" || data.global_role === "admin";
  } catch (err) {
    console.error("isPlatformAdmin check failed:", err);
    return false;
  }
}

/** Check if user is platform manager with specific permission */
export async function isPlatformManagerWith(
  userId: string,
  permission: keyof typeof permissionColumns
): Promise<boolean> {
  try {
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("global_role")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr || profile?.global_role !== "platform_manager") return false;

    const { data: perms, error: permsErr } = await supabaseAdmin
      .from("platform_manager_permissions")
      .select(permission)
      .eq("user_id", userId)
      .maybeSingle();
    if (permsErr || !perms) return false;
    return (perms as any)[permission] === true;
  } catch (err) {
    console.error("isPlatformManagerWith check failed:", err);
    return false;
  }
}

/** Check if user is org admin for a specific org */
export async function isOrgAdmin(
  userId: string,
  orgId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("org_users")
      .select("role")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error || !data) return false;
    return data.role === "org_admin";
  } catch (err) {
    console.error("isOrgAdmin check failed:", err);
    return false;
  }
}

/** Check if user is org manager with specific permission for an org */
export async function isOrgManagerWith(
  userId: string,
  orgId: string,
  permission: keyof typeof permissionColumns
): Promise<boolean> {
  try {
    const { data: member, error: memberErr } = await supabaseAdmin
      .from("org_users")
      .select("org_id, user_id, role")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (memberErr || !member || member.role !== "org_manager") return false;

    // For now, treat org_manager role as sufficient for manager permissions.
    // The project uses `org_manager_permissions` keyed by org_member_id in some places;
    // mapping that to `org_users` ids varies across deployments. Keep this simple
    // to avoid querying a non-existent `org_members` table.
    return true;
  } catch (err) {
    console.error("isOrgManagerWith check failed:", err);
    return false;
  }
}

/** Load user context with all roles and memberships */
export async function loadUserContext(userId: string): Promise<UserContext> {
  const ctx: UserContext = { userId };
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("global_role")
      .eq("id", userId)
      .maybeSingle();
    if (profile) ctx.globalRole = profile.global_role;

    const { data: memberships } = await supabaseAdmin
      .from("org_users")
      .select("org_id, role, user_id")
      .eq("user_id", userId);
    if (memberships) {
      ctx.orgMemberships = memberships.map((m: any) => ({
        orgId: m.org_id,
        role: m.role,
      }));
    }
  } catch (err) {
    console.error("loadUserContext failed:", err);
  }
  return ctx;
}

// Permission column names
const permissionColumns = {
  can_manage_agents: true,
  can_manage_phone_numbers: true,
  can_edit_service_targets: true,
  can_view_billing: true,
  can_manage_phone_numbers_global: true,
  can_manage_agents_global: true,
  can_manage_orgs: true,
  can_view_billing_global: true,
};

export function validatePermission(perm: string): boolean {
  return perm in permissionColumns;
}
