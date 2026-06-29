// client/src/lib/apiClient.ts
import { API_BASE_URL, buildApiUrl } from "../config";
import { supabase } from "./supabaseClient";

type Json = any;
type FetchJsonInit = RequestInit & { timeoutMs?: number };
const readCache = new Map<string, { expiresAt: number; value: Json }>();
const READ_CACHE_TTL_MS = 30_000;

function shouldAttachBrowserAuth(url: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return parsed.pathname.startsWith("/api");
    if (!API_BASE_URL) return false;
    const apiOrigin = new URL(API_BASE_URL, window.location.origin).origin;
    return parsed.origin === apiOrigin;
  } catch {
    return false;
  }
}

async function withBrowserAuthHeaders(url: string, init?: FetchJsonInit): Promise<FetchJsonInit | undefined> {
  if (!shouldAttachBrowserAuth(url)) return init;

  const headers = new Headers(init?.headers || {});
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
    if (session?.user?.id && !headers.has("x-user-id")) {
      headers.set("x-user-id", session.user.id);
    }
  } catch (err) {
    console.warn("[apiClient] Failed to attach Supabase session to API request", err);
  }

  return { ...(init || {}), headers };
}

export async function fetchJson(path: string, init?: FetchJsonInit) {
  const url = path.startsWith("http") ? path : buildApiUrl(path);
  const requestInit = await withBrowserAuthHeaders(url, init);
  const method = String(requestInit?.method || "GET").toUpperCase();
  const cacheableRead = method === "GET" && /\/api\/(dashboard|kpi|client-metrics|reports|calls|recordings|sms)/.test(url);
  if (cacheableRead) {
    const cached = readCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
  }
  // Use a generous timeout to avoid indefinite fetch hangs in the browser
  // 15s gives the backend time to process requests, while still catching hangs
  const timeoutMs = requestInit?.timeoutMs ?? 15000; // 15s default

  async function fetchWithTimeout(u: string, i?: FetchJsonInit, t = timeoutMs) {
    if (typeof (import.meta as any).env !== 'undefined' && (import.meta as any).env.VITE_DEBUG_API === 'true') {
      // eslint-disable-next-line no-console
      console.debug(`[fetchWithTimeout] -> ${i?.method || 'GET'} ${u} (timeout=${t}ms)`);
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), t);
    try {
      const { timeoutMs: _timeoutMs, ...requestInit } = i || {};
      const res = await fetch(u, { cache: (requestInit as any).cache || 'no-store', ...requestInit, signal: controller.signal });
      return res;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error(`Request timeout after ${t}ms: ${u}`);
      }
      throw err;
    } finally {
      clearTimeout(id);
    }
  }

  const res = await fetchWithTimeout(url, requestInit);
  // Optionally dump response metadata and snippet to console when debug enabled
  if (typeof (import.meta as any).env !== 'undefined' && (import.meta as any).env.VITE_DEBUG_API === 'true') {
    const contentType = res.headers.get('content-type') || 'unknown';
    let snippet = '';
    try {
      const text = await res.clone().text();
      snippet = text.slice(0, 200);
    } catch (e) {
      snippet = '<unable to read response text>';
    }
    // eslint-disable-next-line no-console
    console.debug(`[fetchJson] <- ${res.status} ${url} content-type=${contentType} snippet=${JSON.stringify(snippet)}`);
  }
  if (!res.ok) {
    // Try to parse JSON body for structured error details
    let detail: string = res.statusText;
    try {
      const j = await res.json();
      if (j && typeof j === 'object') {
        detail = j.detail || JSON.stringify(j);
      }
    } catch (e) {
      const text = await res.text().catch(() => "");
      if (text) detail = text;
    }

    const err: any = new Error(detail || `${res.status} ${res.statusText}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  if (res.status === 204) return null as any;
  const json = await res.json() as Json;
  if (cacheableRead) readCache.set(url, { value: json, expiresAt: Date.now() + READ_CACHE_TTL_MS });
  return json;
}

export async function apiFetch(path: string, init?: FetchJsonInit) {
  const url = path.startsWith("http") ? path : buildApiUrl(path);
  const requestInit = await withBrowserAuthHeaders(url, init);
  const { timeoutMs: _timeoutMs, ...cleanInit } = requestInit || {};
  return fetch(url, { cache: (cleanInit as any).cache || 'no-store', ...cleanInit });
}

export type Metrics = {
  org_id?: string;
  total_calls: number;
  answered_calls: number;
  answer_rate_pct: number;
  avg_wait_seconds: number;
};

export async function getClientMetrics(orgId?: string | null): Promise<Metrics> {
  const path = orgId ? `/api/client-metrics?org_id=${encodeURIComponent(orgId)}` : `/api/client-metrics`;
  const json = await fetchJson(path);
  return (json.metrics ?? json) as Metrics;
}

export type CallItem = {
  id: string;
  direction?: string;
  status?: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  queueName?: string | null;
  startedAt?: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  agentName?: string | null;
  agentExtension?: string | null;
};

export async function getRecentCalls(params?: { orgId?: string; limit?: number }): Promise<CallItem[]> {
  const q = new URLSearchParams();
  if (params?.orgId) q.set("org_id", params.orgId);
  if (params?.limit) q.set("limit", String(params.limit));
  const path = `/api/calls/recent?${q.toString()}`;
  const json = await fetchJson(path);
  return (json.items ?? json) as CallItem[];
}

export async function getCallSeries(params?: { orgId?: string; range?: string }) {
  const q = new URLSearchParams();
  if (params?.orgId) q.set("org_id", params.orgId);
  q.set("range", params?.range ?? "day");
  const path = `/api/calls/series?${q.toString()}`;
  const json = await fetchJson(path);
  return (json.points ?? json) as Array<{ bucketLabel: string; totalCalls: number; answered: number; missed: number }>;
}

export async function getQueueSummary(params?: { orgId?: string }) {
  const q = new URLSearchParams();
  if (params?.orgId) q.set("org_id", params.orgId);
  const path = `/api/calls/queue-summary?${q.toString()}`;
  const json = await fetchJson(path);
  return (json.queues ?? json) as Array<{ name: string | null; totalCalls: number; answered: number; missed: number }>;
}

// Org API keys
export async function getOrgApiKeys(orgId: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/api-keys`, { headers: { 'x-user-id': userId || '' } });
}

export async function createOrgApiKey(orgId: string, label: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ label }),
  });
}

export async function deleteOrgApiKey(orgId: string, keyId: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/api-keys/${encodeURIComponent(keyId)}`, { method: 'DELETE', headers: { 'x-user-id': userId || '' } });
}

// Platform (global) API keys — admin-only
export async function getPlatformApiKeys(userId?: string) {
  return await fetchJson(`/api/admin/platform-api-keys`, { headers: { 'x-user-id': userId || '' } });
}

export async function createPlatformApiKey(name: string, userId?: string) {
  return await fetchJson(`/api/admin/platform-api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ name }),
  });
}

export async function deletePlatformApiKey(id: string, userId?: string) {
  return await fetchJson(`/api/admin/platform-api-keys/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-user-id': userId || '' } });
}

export default {
  getClientMetrics,
  getRecentCalls,
  getCallSeries,
  getQueueSummary,
};

// Org members (org admins can manage)
export async function getOrgMembers(orgId: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/members`, { headers: { 'x-user-id': userId || '' } });
}

export async function getOrgAgentLiveStatus(orgId: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/agents/live-status`, { headers: { 'x-user-id': userId || '' } });
}

export async function getOrgMightyCallExtensions(orgId: string, userId?: string, options?: { liveOnly?: boolean }) {
  const q = new URLSearchParams();
  if (options?.liveOnly) q.set('live_only', 'true');
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/mightycall/extensions${suffix}`, { headers: { 'x-user-id': userId || '' } });
}

export async function cleanupOrgMightyCallExtensions(orgId: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/mightycall/extensions/cleanup`, {
    method: 'POST',
    headers: { 'x-user-id': userId || '' }
  });
}

export async function getAdminMightyCallExtensions(userId?: string, options?: { liveOnly?: boolean }) {
  const q = new URLSearchParams();
  if (options?.liveOnly) q.set('live_only', 'true');
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return await fetchJson(`/api/admin/mightycall/extensions${suffix}`, { headers: { 'x-user-id': userId || '' } });
}

export async function importAdminMightyCallExtension(extension: string, orgId?: string | null, userId?: string) {
  return await fetchJson(`/api/admin/mightycall/extensions/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ extension, orgId: orgId || null })
  });
}

export async function getVerifiedAdminMightyCallExtensions(userId?: string) {
  return await fetchJson(`/api/admin/mightycall/extensions/verified`, { headers: { 'x-user-id': userId || '' } });
}

export async function getLiveAgentStatus(params?: { orgId?: string | null }, userId?: string) {
  const q = new URLSearchParams();
  if (params?.orgId) q.set('org_id', params.orgId);
  q.set('_live', String(Date.now()));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return await fetchJson(`/api/live-status${suffix}`, {
    cache: 'no-store',
    headers: { 'x-user-id': userId || '', 'Cache-Control': 'no-cache' },
    timeoutMs: 12000,
  });
}

export async function refreshLiveAgentStatus(orgId?: string | null, userId?: string) {
  return await fetchJson(`/api/live-status/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ orgId: orgId || null }),
    timeoutMs: 20000,
  });
}

// MightyCall sync helpers
export async function triggerMightyCallPhoneNumberSync(userId?: string) {
  return await fetchJson(`/api/mightycall/sync/phone-numbers`, { method: 'POST', headers: { 'x-user-id': userId || '' } });
}

export async function triggerMightyCallRecentCallsSync(orgId?: string | null, userId?: string) {
  return await fetchJson(`/api/mightycall/sync/recent-calls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ orgId: orgId || null, windowHours: 6 }),
    timeoutMs: 15000,
  });
}

export async function triggerMightyCallReportsSync(orgId: string, startDate?: string, endDate?: string, userId?: string) {
  return await fetchJson(`/api/mightycall/sync/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ orgId, startDate, endDate })
  });
}

export async function triggerMightyCallRecordingsSync(orgId: string, startDate?: string, endDate?: string, userId?: string) {
  return await fetchJson(`/api/mightycall/sync/recordings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ orgId, startDate, endDate })
  });
}

export async function triggerMightyCallSMSSync(orgId: string, userId?: string) {
  return await fetchJson(`/api/mightycall/sync/sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ orgId })
  });
}

export async function sendSmsMessage(params: { orgId: string; from: string; to: string | string[]; message: string }, userId?: string) {
  return await fetchJson(`/api/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify(params),
  });
}

export async function getAdminLogs(type: string, params?: Record<string, string | number | boolean | null | undefined>, userId?: string) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') q.set(key, String(value));
  }
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return await fetchJson(`/api/admin/logs/${encodeURIComponent(type)}${suffix}`, { headers: { 'x-user-id': userId || '' } });
}

export async function getAdminLogsSummary(params?: Record<string, string | number | boolean | null | undefined>, userId?: string) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') q.set(key, String(value));
  }
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return await fetchJson(`/api/admin/logs/summary${suffix}`, { headers: { 'x-user-id': userId || '' } });
}

export async function updateErrorLogResolved(id: string, resolved: boolean, userId?: string) {
  return await fetchJson(`/api/admin/logs/errors/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ resolved }),
  });
}

export type LeadItem = {
  id: string;
  organization_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone: string;
  email?: string | null;
  state?: string | null;
  debt_amount?: number | string | null;
  lead_type?: string | null;
  opt_in_source?: string | null;
  ip_address?: string | null;
  trusted_id?: string | null;
  form_number?: string | null;
  tcpa_consent?: boolean | null;
  tcpa_timestamp?: string | null;
  status?: string | null;
  assigned_agent_id?: string | null;
  assigned_at?: string | null;
  contacted_at?: string | null;
  transferred_at?: string | null;
  call_attempts?: number | null;
  notes?: string | null;
  source?: string | null;
  source_lead_id?: string | null;
  lead_source_id?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  raw_payload?: Record<string, any> | null;
  received_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type LeadSourceItem = {
  id: string;
  source_name: string;
  source_label?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  organization_id: string;
  lead_type?: string | null;
  description?: string | null;
  routing_priority?: number | null;
  active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  organizations?: { id: string; name: string } | null;
};

export type LeadActivityItem = {
  id: string;
  action: string;
  actor_id?: string | null;
  org_id?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
};

export async function getLeads(params?: Record<string, string | number | boolean | null | undefined>, userId?: string) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') q.set(key, String(value));
  }
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return await fetchJson(`/api/leads${suffix}`, {
    headers: { 'x-user-id': userId || '' },
    cache: 'no-store',
  }) as { items: LeadItem[]; limit: number; offset: number };
}

export async function getLeadsSummary(params?: Record<string, string | number | boolean | null | undefined>, userId?: string) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') q.set(key, String(value));
  }
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return await fetchJson(`/api/leads/summary${suffix}`, {
    headers: { 'x-user-id': userId || '' },
    cache: 'no-store',
  });
}

export async function updateLead(leadId: string, patch: Record<string, any>, userId?: string) {
  return await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify(patch),
  }) as { item: LeadItem };
}

export async function getLeadActivity(leadId: string, userId?: string) {
  return await fetchJson(`/api/leads/${encodeURIComponent(leadId)}/activity`, {
    headers: { 'x-user-id': userId || '' },
    cache: 'no-store',
  }) as { items: LeadActivityItem[] };
}

export async function getLeadSources(params?: Record<string, string | number | boolean | null | undefined>, userId?: string) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') q.set(key, String(value));
  }
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return await fetchJson(`/api/leads/sources${suffix}`, {
    headers: { 'x-user-id': userId || '' },
    cache: 'no-store',
  }) as { items: LeadSourceItem[] };
}

export async function createLeadSource(payload: Partial<LeadSourceItem>, userId?: string) {
  return await fetchJson('/api/leads/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify(payload),
  }) as { item: LeadSourceItem };
}

export async function updateLeadSource(sourceId: string, patch: Partial<LeadSourceItem>, userId?: string) {
  return await fetchJson(`/api/leads/sources/${encodeURIComponent(sourceId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify(patch),
  }) as { item: LeadSourceItem };
}

export type LeadsVisibility = { agents: boolean; clients: boolean };

export async function updateLeadsVisibility(orgId: string, visibility: Partial<LeadsVisibility>, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/leads-visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify(visibility),
  }) as { org: { id: string; leads_visibility: LeadsVisibility } };
}

export async function listMightyCallSyncJobs(params?: { orgId?: string; status?: string; limit?: number }, userId?: string) {
  const q = new URLSearchParams();
  if (params?.orgId) q.set('orgId', params.orgId);
  if (params?.status) q.set('status', params.status);
  if (params?.limit) q.set('limit', String(params.limit));
  return await fetchJson(`/api/mightycall/sync/jobs?${q.toString()}`, { headers: { 'x-user-id': userId || '' } });
}

export async function createOrgMember(orgId: string, email: string, role: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/team-invites`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ email, role })
  });
}

export async function createOrgOwnerInvite(orgId: string, ownerEmail: string, ownerRole: string, userId?: string) {
  return await fetchJson(`/api/admin/org-owner-invites`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ orgId, ownerEmail, ownerRole })
  });
}

export async function deleteOrgMember(orgId: string, targetUserId: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(targetUserId)}`, { method: 'DELETE', headers: { 'x-user-id': userId || '' } });
}

export async function updateOrgMemberRole(orgId: string, targetUserId: string, role: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(targetUserId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ role }),
  });
}

export async function getOrgManagerPermissions(orgId: string, orgMemberId: string, userId?: string) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/managers/${encodeURIComponent(orgMemberId)}/permissions`, {
    headers: { 'x-user-id': userId || '' }
  });
}

export async function saveOrgManagerPermissions(
  orgId: string,
  orgMemberId: string,
  permissions: {
    can_manage_agents?: boolean;
    can_manage_phone_numbers?: boolean;
    can_edit_service_targets?: boolean;
    can_view_billing?: boolean;
  },
  userId?: string
) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/managers/${encodeURIComponent(orgMemberId)}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify(permissions),
  });
}
// Organization integrations (MightyCall, etc.)
export async function getOrgIntegrations(orgId: string, userId?: string) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/integrations`, { headers: { 'x-user-id': userId || '' } });
}

export async function saveOrgIntegration(orgId: string, data: { integration_type: string; label?: string; credentials: any }, userId?: string) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/integrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify(data)
  });
}

export async function deleteOrgIntegration(orgId: string, integrationId: string, userId?: string) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(integrationId)}`, { method: 'DELETE', headers: { 'x-user-id': userId || '' } });
}

export async function getOrgIntegrationHealth(orgId: string, userId?: string) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/integrations/health`, {
    headers: { 'x-user-id': userId || '' },
    timeoutMs: 30000,
  });
}

export async function getProductionHealth(userId?: string) {
  return await fetchJson(`/api/admin/production-health`, { headers: { 'x-user-id': userId || '' } });
}

export async function getSchemaHealth(userId?: string) {
  return await fetchJson(`/api/admin/schema-health`, { headers: { 'x-user-id': userId || '' } });
}

export async function getSecurityPolicyHealth(userId?: string) {
  return await fetchJson(`/api/admin/security-policy-health`, { headers: { 'x-user-id': userId || '' } });
}

export async function getMyFeatures(orgId?: string | null, userId?: string) {
  const suffix = orgId ? `?org_id=${encodeURIComponent(orgId)}` : '';
  return await fetchJson(`/api/me/features${suffix}`, { headers: { 'x-user-id': userId || '' } });
}

export async function getOrgFeatures(orgId: string, userId?: string) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/features`, {
    headers: { 'x-user-id': userId || '' },
  });
}

export async function saveOrgFeatures(
  orgId: string,
  features: Array<{ feature_key: string; enabled: boolean; visible_to_roles?: string[] }>,
  userId?: string
) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/features`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ features }),
  });
}

export async function getUserFeatureOverrides(orgId: string, targetUserId: string, userId?: string) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(targetUserId)}/features`, {
    headers: { 'x-user-id': userId || '' },
  });
}

export async function saveUserFeatureOverrides(
  orgId: string,
  targetUserId: string,
  features: Array<{ feature_key: string; enabled: boolean | null }>,
  userId?: string
) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(targetUserId)}/features`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ features }),
  });
}

export async function getMembershipDrift(userId?: string, limit = 100) {
  return await fetchJson(`/api/admin/membership-drift?limit=${encodeURIComponent(String(limit))}`, {
    headers: { 'x-user-id': userId || '' }
  });
}


// ─── Lead uploads ─────────────────────────────────────────────────────────────

export async function uploadLeadList(payload: {
  rows: Record<string, any>[];
  organization_id?: string | null;
  assigned_agent_id?: string | null;
  notify?: boolean;
}, userId?: string) {
  return await fetchJson('/api/leads/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify(payload),
    timeoutMs: 60_000,
  });
}

export async function getLeadUploads(params?: { organization_id?: string }, userId?: string) {
  const q = new URLSearchParams();
  if (params?.organization_id) q.set('organization_id', params.organization_id);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return await fetchJson(`/api/leads/uploads${suffix}`, { headers: { 'x-user-id': userId || '' } });
}

export async function getUploadPermissions(orgId?: string, userId?: string) {
  const q = new URLSearchParams();
  if (orgId) q.set('org_id', orgId);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return await fetchJson(`/api/admin/users/upload-permissions${suffix}`, { headers: { 'x-user-id': userId || '' } });
}

export async function setUploadPermission(targetUserId: string, can_upload_leads: boolean, userId?: string) {
  return await fetchJson(`/api/admin/users/${encodeURIComponent(targetUserId)}/upload-permission`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ can_upload_leads }),
  });
}

export async function getAdminAuditLogs(userId?: string, options?: { limit?: number; offset?: number; orgId?: string; action?: string }) {
  const q = new URLSearchParams();
  if (options?.limit) q.set('limit', String(options.limit));
  if (options?.offset) q.set('offset', String(options.offset));
  if (options?.orgId) q.set('org_id', options.orgId);
  if (options?.action) q.set('action', options.action);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return await fetchJson(`/api/admin/audit-logs${suffix}`, { headers: { 'x-user-id': userId || '' } });
}
