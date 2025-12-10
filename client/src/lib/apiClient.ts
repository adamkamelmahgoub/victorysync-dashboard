// client/src/lib/apiClient.ts
import { API_BASE_URL } from "../config";

type Json = any;

async function fetchJson(path: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, { ...init });
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

export default {
  getClientMetrics,
  getRecentCalls,
  getCallSeries,
  getQueueSummary,
};
