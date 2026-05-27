import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';

type SupabaseAdmin = {
  from: (table: string) => any;
};

const sensitiveKeyPattern = /(password|token|key|secret|card|cvv|ssn|authorization|cookie|payment)/i;

export function stripSensitiveFields(value: any): any {
  if (Array.isArray(value)) return value.map(stripSensitiveFields);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, next] of Object.entries(value)) {
      out[key] = sensitiveKeyPattern.test(key) ? '[redacted]' : stripSensitiveFields(next);
    }
    return out;
  }
  if (typeof value === 'string') return value.replace(/\0/g, '').slice(0, 20_000);
  return value;
}

function hashIp(ip: string) {
  const salt = process.env.LOG_IP_HASH_SALT || process.env.CSRF_SECRET || process.env.SUPABASE_SERVICE_KEY || 'victorysync-log-ip-dev';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

export function getRequestIpHash(req: Request) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.ip || req.socket.remoteAddress || 'unknown';
  return hashIp(ip);
}

function getRequestSize(req: Request) {
  const raw = req.headers['content-length'];
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) return parsed;
  try {
    return Buffer.byteLength(JSON.stringify(req.body || {}));
  } catch {
    return 0;
  }
}

async function resolveOrganizationId(supabaseAdmin: SupabaseAdmin, req: Request) {
  const explicit = String(
    (req.body && (req.body.organization_id || req.body.org_id || req.body.orgId)) ||
    req.query.organization_id ||
    req.query.org_id ||
    ''
  ).trim();
  if (explicit) return explicit;
  const actorId = String((req as any).actorId || '');
  if (!actorId) return null;
  try {
    const { data } = await supabaseAdmin
      .from('org_users')
      .select('org_id')
      .eq('user_id', actorId)
      .limit(1)
      .maybeSingle();
    return data?.org_id || null;
  } catch {
    return null;
  }
}

export async function insertLogSafely(supabaseAdmin: SupabaseAdmin, table: string, row: Record<string, any>) {
  try {
    await supabaseAdmin.from(table).insert(stripSensitiveFields(row));
  } catch {
    // Logging must never block the main user experience.
  }
}

export const activityLogSchema = z.object({
  event_type: z.string().min(1).max(80),
  event_name: z.string().min(1).max(200),
  page: z.string().max(500).optional().nullable(),
  element: z.string().max(200).optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional().default({}),
  session_id: z.string().max(200).optional().nullable(),
});

export const pageViewLogSchema = z.object({
  page: z.string().min(1).max(500),
  page_title: z.string().max(300).optional().nullable(),
  referrer: z.string().max(1000).optional().nullable(),
  time_on_page_seconds: z.number().int().min(0).max(86400).optional().nullable(),
  session_id: z.string().max(200).optional().nullable(),
});

export const errorLogSchema = z.object({
  error_type: z.string().min(1).max(80),
  error_message: z.string().min(1).max(2000),
  error_stack: z.string().max(12000).optional().nullable(),
  endpoint: z.string().max(1000).optional().nullable(),
  http_status: z.number().int().min(100).max(599).optional().nullable(),
  request_payload: z.any().optional().nullable(),
  session_id: z.string().max(200).optional().nullable(),
});

export const apiLogSchema = z.object({
  method: z.string().min(1).max(12),
  endpoint: z.string().min(1).max(1000),
  status_code: z.number().int().min(100).max(599).optional().nullable(),
  response_time_ms: z.number().int().min(0).max(300000).optional().nullable(),
  request_size_bytes: z.number().int().min(0).optional().nullable(),
  response_size_bytes: z.number().int().min(0).optional().nullable(),
  session_id: z.string().max(200).optional().nullable(),
});

export const authLogSchema = z.object({
  event_type: z.string().min(1).max(80),
  email: z.string().max(320).optional().nullable(),
  failure_reason: z.string().max(500).optional().nullable(),
  session_id: z.string().max(200).optional().nullable(),
});

export async function baseLogRow(supabaseAdmin: SupabaseAdmin, req: Request) {
  return {
    user_id: (req as any).actorId || null,
    organization_id: await resolveOrganizationId(supabaseAdmin, req),
    ip_address: getRequestIpHash(req),
    user_agent: String(req.headers['user-agent'] || '').slice(0, 1000),
  };
}

export function createApiLoggerMiddleware(supabaseAdmin: SupabaseAdmin) {
  return function apiLogger(req: Request, res: Response, next: NextFunction) {
    if (!req.path.startsWith('/') || req.path.startsWith('/logs/')) return next();
    const startedAt = Date.now();
    const requestSize = getRequestSize(req);
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let responseSize = 0;
    (res as any).json = (body: any) => {
      try { responseSize = Buffer.byteLength(JSON.stringify(body || {})); } catch {}
      return originalJson(body);
    };
    (res as any).send = (body: any) => {
      if (typeof body === 'string') responseSize = Buffer.byteLength(body);
      else if (Buffer.isBuffer(body)) responseSize = body.length;
      return originalSend(body);
    };
    res.on('finish', async () => {
      const base = await baseLogRow(supabaseAdmin, req);
      await insertLogSafely(supabaseAdmin, 'api_logs', {
        ...base,
        session_id: String(req.headers['x-session-id'] || req.body?.session_id || '').slice(0, 200) || null,
        method: req.method.toUpperCase(),
        endpoint: req.originalUrl || req.path,
        status_code: res.statusCode,
        response_time_ms: Date.now() - startedAt,
        request_size_bytes: requestSize,
        response_size_bytes: responseSize,
      });
    });
    next();
  };
}

export async function isAdminLogViewer(supabaseAdmin: SupabaseAdmin, userId: string | null, orgId?: string | null) {
  if (!userId) return false;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('global_role')
    .eq('id', userId)
    .maybeSingle();
  const globalRole = String(profile?.global_role || '');
  if (['admin', 'super_admin', 'platform_admin'].includes(globalRole)) return true;
  if (!orgId) return false;
  const { data: member } = await supabaseAdmin
    .from('org_users')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();
  return ['admin', 'super_admin', 'org_admin'].includes(String(member?.role || ''));
}
