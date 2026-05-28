import { supabaseAdmin } from './supabaseClient';
import { getCanonicalMembership } from './memberships';

export const FEATURE_DEFINITIONS = [
  { key: 'dashboard', label: 'Dashboard', defaultEnabled: true },
  { key: 'live_status', label: 'Live Status', defaultEnabled: true },
  { key: 'numbers', label: 'Phone Numbers', defaultEnabled: true },
  { key: 'leads', label: 'Leads', defaultEnabled: true },
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

export async function getUserFeatureAccess(userId: string, orgId: string | null) {
  if (!orgId) return defaultAccess();

  const membership = await getCanonicalMembership(orgId, userId);
  if (!membership) return defaultAccess();

  const [orgConfig, overridesRes] = await Promise.all([
    getOrgFeatureConfig(orgId),
    supabaseAdmin
      .from('user_feature_access')
      .select('feature_key, enabled')
      .eq('org_id', orgId)
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
    if (isKnownFeatureKey(String(key))) access[key as FeatureKey] = Boolean(enabled);
  }
  return access;
}
