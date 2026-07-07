import { supabaseAdmin } from './supabaseClient';
import { getCanonicalMembership } from './memberships';

export const FEATURE_DEFINITIONS = [
  { key: 'dashboard', label: 'Dashboard', defaultEnabled: true },
  { key: 'live_status', label: 'Live Status', defaultEnabled: true },
  { key: 'numbers', label: 'Phone Numbers', defaultEnabled: true },
  { key: 'leads', label: 'Leads', defaultEnabled: true },
  { key: 'lead_generation', label: 'Lead Generation Hub', defaultEnabled: true },
  { key: 'lead_campaigns', label: 'Lead Campaigns', defaultEnabled: true },
  { key: 'lead_forms', label: 'Lead Forms', defaultEnabled: true },
  { key: 'lead_automations', label: 'Lead Automations', defaultEnabled: true },
  { key: 'lead_sequences', label: 'Lead Sequences', defaultEnabled: true },
  { key: 'lead_integrations', label: 'Lead Integrations', defaultEnabled: true },
  { key: 'reports', label: 'Reports', defaultEnabled: true },
  { key: 'recordings', label: 'Recordings', defaultEnabled: true },
  { key: 'sms', label: 'SMS', defaultEnabled: true },
  { key: 'support', label: 'Support', defaultEnabled: true },
  { key: 'billing', label: 'Billing', defaultEnabled: false },
  { key: 'team', label: 'Team', defaultEnabled: false },
  { key: 'api_keys', label: 'API Keys', defaultEnabled: false },
] as const;

export type FeatureKey = typeof FEATURE_DEFINITIONS[number]['key'];

const featureKeys = new Set<string>(FEATURE_DEFINITIONS.map((feature) => feature.key));

export function isKnownFeatureKey(key: string): key is FeatureKey {
  return featureKeys.has(key);
}

function defaultAccess() {
  return Object.fromEntries(FEATURE_DEFINITIONS.map((feature) => [feature.key, feature.defaultEnabled])) as Record<FeatureKey, boolean>;
}

export async function getOrgFeatureConfig(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('org_feature_access')
    .select('feature_key, enabled, visible_to_roles, updated_at')
    .eq('org_id', orgId);
  if (error && !String(error.message || '').includes('Could not find the table')) throw error;

  const rows = new Map((data || []).map((row: any) => [row.feature_key, row]));
  return FEATURE_DEFINITIONS.map((feature) => {
    const row = rows.get(feature.key) as any;
    return {
      ...feature,
      enabled: row?.enabled ?? feature.defaultEnabled,
      visible_to_roles: Array.isArray(row?.visible_to_roles) && row.visible_to_roles.length
        ? row.visible_to_roles
        : ['org_admin', 'org_manager', 'agent'],
      updated_at: row?.updated_at || null,
    };
  });
}

export async function saveOrgFeatureConfig(orgId: string, features: Array<{ feature_key: string; enabled: boolean; visible_to_roles?: string[] }>) {
  const validRows = features
    .filter((feature) => isKnownFeatureKey(feature.feature_key))
    .map((feature) => ({
      org_id: orgId,
      feature_key: feature.feature_key,
      enabled: Boolean(feature.enabled),
      visible_to_roles: Array.isArray(feature.visible_to_roles) && feature.visible_to_roles.length
        ? feature.visible_to_roles.map(String)
        : ['org_admin', 'org_manager', 'agent'],
      updated_at: new Date().toISOString(),
    }));

  if (validRows.length === 0) return getOrgFeatureConfig(orgId);

  const { error } = await supabaseAdmin
    .from('org_feature_access')
    .upsert(validRows, { onConflict: 'org_id,feature_key' });
  if (error) throw error;
  return getOrgFeatureConfig(orgId);
}

async function resolveFeatureOrgForUser(userId: string, orgId: string | null) {
  if (orgId) return orgId;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('global_role')
    .eq('id', userId)
    .maybeSingle();
  if (['platform_admin', 'admin', 'super_admin'].includes(String(profile?.global_role || ''))) {
    return null;
  }

  const { data: orgUser } = await supabaseAdmin
    .from('org_users')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (orgUser?.org_id) return orgUser.org_id;

  const { data: orgMember } = await supabaseAdmin
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return orgMember?.org_id || null;
}

export async function getUserFeatureAccess(userId: string, orgId: string | null) {
  const resolvedOrgId = await resolveFeatureOrgForUser(userId, orgId);
  if (!resolvedOrgId) return defaultAccess();

  const membership = await getCanonicalMembership(resolvedOrgId, userId);
  if (!membership) return Object.fromEntries(FEATURE_DEFINITIONS.map((feature) => [feature.key, feature.key === 'dashboard'])) as Record<FeatureKey, boolean>;

  const [orgConfig, overridesRes] = await Promise.all([
    getOrgFeatureConfig(resolvedOrgId),
    supabaseAdmin
      .from('user_feature_access')
      .select('feature_key, enabled')
      .eq('org_id', resolvedOrgId)
      .eq('user_id', userId),
  ]);

  const overrides = new Map(((overridesRes as any).data || []).map((row: any) => [row.feature_key, row.enabled]));
  const access = defaultAccess();
  for (const feature of orgConfig) {
    const visibleRoles = Array.isArray(feature.visible_to_roles) ? feature.visible_to_roles : [];
    access[feature.key as FeatureKey] = Boolean(feature.enabled) && (
      visibleRoles.length === 0 || visibleRoles.includes(membership.role)
    );
  }
  for (const [key, enabled] of overrides) {
    if (!isKnownFeatureKey(String(key))) continue;
    const orgFeature = orgConfig.find((feature) => feature.key === key);
    if (orgFeature?.enabled === false) {
      access[key as FeatureKey] = false;
    } else {
      access[key as FeatureKey] = Boolean(enabled);
    }
  }
  return access;
}

export async function getUserFeatureOverrides(orgId: string, userId: string) {
  const access = await getUserFeatureAccess(userId, orgId);
  const { data, error } = await supabaseAdmin
    .from('user_feature_access')
    .select('feature_key, enabled, updated_at')
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (error && !String(error.message || '').includes('Could not find the table')) throw error;
  const overrides = new Map((data || []).map((row: any) => [row.feature_key, row]));

  return FEATURE_DEFINITIONS.map((feature) => ({
    ...feature,
    effective_enabled: access[feature.key],
    override_enabled: overrides.has(feature.key) ? Boolean((overrides.get(feature.key) as any).enabled) : null,
    updated_at: (overrides.get(feature.key) as any)?.updated_at || null,
  }));
}

export async function saveUserFeatureOverrides(orgId: string, userId: string, features: Array<{ feature_key: string; enabled: boolean | null }>) {
  const deletes = features.filter((feature) => feature.enabled === null && isKnownFeatureKey(feature.feature_key));
  const upserts = features
    .filter((feature) => feature.enabled !== null && isKnownFeatureKey(feature.feature_key))
    .map((feature) => ({
      org_id: orgId,
      user_id: userId,
      feature_key: feature.feature_key,
      enabled: Boolean(feature.enabled),
      updated_at: new Date().toISOString(),
    }));

  for (const row of deletes) {
    const { error } = await supabaseAdmin
      .from('user_feature_access')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('feature_key', row.feature_key);
    if (error) throw error;
  }

  if (upserts.length) {
    const { error } = await supabaseAdmin
      .from('user_feature_access')
      .upsert(upserts, { onConflict: 'org_id,user_id,feature_key' });
    if (error) throw error;
  }

  return getUserFeatureOverrides(orgId, userId);
}
