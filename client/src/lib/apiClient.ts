// client/src/lib/apiClient.ts
import { API_BASE_URL, buildApiUrl } from "../config";

type Json = any;

export async function fetchJson(path: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : buildApiUrl(path);
  // Use a generous timeout to avoid indefinite fetch hangs in the browser
  // 15s gives the backend time to process requests, while still catching hangs
  const timeoutMs = 15000; // 15s

  async function fetchWithTimeout(u: string, i?: RequestInit, t = timeoutMs) {
    if (typeof (import.meta as any).env !== 'undefined' && (import.meta as any).env.VITE_DEBUG_API === 'true') {
      // eslint-disable-next-line no-console
      console.debug(`[fetchWithTimeout] -> ${i?.method || 'GET'} ${u} (timeout=${t}ms)`);
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), t);
    try {
      const res = await fetch(u, { cache: (i && (i as any).cache) || 'no-store', ...i, signal: controller.signal });
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

  const res = await fetchWithTimeout(url, init);
  // Optionally dump response metadata and snippet to console when debug enabled
  if (typeof (import.meta as any).env !== 'undefined' && (import.meta as any).env.VITE_DEBUG_API === 'true') {
    const contentType = res.headers.get('content-type') || 'unknown';
    let snippet = '';
    try {
      const text = await res.text();
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
  return res.json() as Promise<Json>;
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

export async function createOrgMember(orgId: string, email: string, role: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/members`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ email, role })
  });
}

export async function deleteOrgMember(orgId: string, targetUserId: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(targetUserId)}`, { method: 'DELETE', headers: { 'x-user-id': userId || '' } });
}
