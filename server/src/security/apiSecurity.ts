import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { z } from 'zod';

type SupabaseAdmin = {
  auth: { getUser: (token: string) => Promise<{ data?: { user?: { id?: string } | null }; error?: any }> };
  from: (table: string) => any;
};

type LimitRule = {
  name: string;
  requests: number;
  window: `${number} ${'s' | 'm' | 'h'}`;
  keyBy: 'ip' | 'user';
};

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL || '';
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const redis = upstashUrl && upstashToken
  ? new Redis({ url: upstashUrl, token: upstashToken })
  : null;

const limiterCache = new Map<string, Ratelimit>();
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

const publicApiRoutes = [
  /^\/auth\/login$/,
  /^\/auth\/signup$/,
  /^\/auth\/reset-password$/,
  /^\/auth\/validate-invite$/,
  /^\/auth\/signup-with-invite$/,
  /^\/access-code\/verify$/,
  /^\/leads\/inbound$/,
  /^\/webhooks\/mightycall$/,
];

const requestObject = z.record(z.string(), z.any());

export function sanitizeString(value: string) {
  return value.replace(/\0/g, '').replace(/<[^>]*>/g, '').trim();
}

function sanitizeValue(value: any): any {
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, next]) => [key, sanitizeValue(next)]));
  }
  return value;
}

function containsMalformedInput(value: any, depth = 0): boolean {
  if (depth > 20) return true;
  if (typeof value === 'string') return value.length > 10_000 || value.includes('\0');
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 200 || value.some((next) => containsMalformedInput(next, depth + 1));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, next]) => (
      key.length > 200 ||
      key.includes('\0') ||
      containsMalformedInput(next, depth + 1)
    ));
  }
  return false;
}

function getIp(req: Request) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket.remoteAddress || 'unknown';
}

function bearerToken(req: Request) {
  const header = String(req.headers.authorization || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
}

function isPublicRoute(req: Request) {
  return publicApiRoutes.some((pattern) => pattern.test(req.path));
}

function parseWindowMs(window: LimitRule['window']) {
  const [amountRaw, unit] = window.split(' ') as [string, string];
  const amount = Number(amountRaw);
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60 * 1000;
  return amount * 60 * 60 * 1000;
}

function resolveLimitRule(req: Request): LimitRule {
  const method = req.method.toUpperCase();
  const path = req.path;
  if (method === 'POST' && path === '/auth/login') return { name: 'auth-login', requests: 5, window: '1 m', keyBy: 'ip' };
  if (method === 'POST' && path === '/auth/signup') return { name: 'auth-signup', requests: 3, window: '1 m', keyBy: 'ip' };
  if (method === 'POST' && path === '/auth/reset-password') return { name: 'auth-reset-password', requests: 3, window: '1 m', keyBy: 'ip' };
  if (method === 'POST' && path === '/access-code/verify') return { name: 'access-code-verify', requests: 5, window: '10 m', keyBy: 'ip' };
  if (method === 'POST' && path === '/leads/inbound') return { name: 'leads-inbound', requests: 500, window: '1 m', keyBy: 'ip' };
  if (method === 'GET' && path.startsWith('/dashboard/')) return { name: 'dashboard-read', requests: 60, window: '1 m', keyBy: 'user' };
  if (method === 'GET' && path.startsWith('/kpi/')) return { name: 'kpi-read', requests: 30, window: '1 m', keyBy: 'user' };
  if (method === 'POST') return { name: 'post-default', requests: 20, window: '1 m', keyBy: 'user' };
  if (method === 'GET') return { name: 'get-default', requests: 100, window: '1 m', keyBy: 'user' };
  return { name: 'mutating-default', requests: 20, window: '1 m', keyBy: 'user' };
}

function getLimiter(rule: LimitRule) {
  const key = `${rule.name}:${rule.requests}:${rule.window}`;
  const existing = limiterCache.get(key);
  if (existing) return existing;
  if (!redis) return null;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(rule.requests, rule.window),
    analytics: true,
    prefix: `victorysync:${rule.name}`,
  });
  limiterCache.set(key, limiter);
  return limiter;
}

async function logRateLimitViolation(supabaseAdmin: SupabaseAdmin, req: Request) {
  try {
    await supabaseAdmin.from('rate_limit_violations').insert({
      ip_address: getIp(req),
      endpoint: `${req.method.toUpperCase()} ${req.originalUrl || req.path}`,
      user_id: (req as any).actorId || null,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Never block the request path because audit logging failed.
  }
}

export function createApiRateLimitMiddleware(supabaseAdmin: SupabaseAdmin) {
  return async function apiRateLimit(req: Request, res: Response, next: NextFunction) {
    const rule = resolveLimitRule(req);
    const identity = rule.keyBy === 'ip'
      ? getIp(req)
      : ((req as any).actorId || (req as any).apiKeyScope?.keyId || getIp(req));
    const limitKey = `${rule.name}:${identity}:${req.method}:${req.path}`;

    let allowed = true;
    let retryAfterSeconds = 60;
    const limiter = getLimiter(rule);
    if (limiter) {
      const result = await limiter.limit(limitKey);
      allowed = result.success;
      retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    } else {
      const windowMs = parseWindowMs(rule.window);
      const now = Date.now();
      const bucket = memoryBuckets.get(limitKey);
      if (!bucket || bucket.resetAt <= now) {
        memoryBuckets.set(limitKey, { count: 1, resetAt: now + windowMs });
      } else {
        bucket.count += 1;
        allowed = bucket.count <= rule.requests;
        retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      }
    }

    if (!allowed) {
      await logRateLimitViolation(supabaseAdmin, req);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: 'Too many requests. Please wait.' });
    }

    next();
  };
}

export function createSupabaseSessionMiddleware(supabaseAdmin: SupabaseAdmin) {
  return async function resolveSupabaseSession(req: Request, _res: Response, next: NextFunction) {
    try {
      let actor: string | null = null;
      const token = bearerToken(req);
      if (token && !(req as any).apiKeyScope) {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (!error && data?.user?.id) {
          actor = data.user.id;
          req.headers['x-user-id'] = actor;
        }
      }

      if (!actor && process.env.NODE_ENV !== 'production') {
        if (req.header('x-dev-bypass') === 'true') {
          actor = process.env.DEV_BYPASS_USER_ID || 'a5f6f998-5ed5-4c0c-88ac-9f27d677697a';
          req.headers['x-user-id'] = actor;
        } else {
          actor = req.header('x-user-id') || null;
        }
      }

      if (!actor && process.env.NODE_ENV === 'production' && req.header('x-user-id')) {
        delete req.headers['x-user-id'];
      }

      (req as any).actorId = actor;
    } catch {
      (req as any).actorId = null;
    }
    next();
  };
}

export function enforceAuthenticatedApi(req: Request, res: Response, next: NextFunction) {
  if (isPublicRoute(req) || (req as any).apiKeyScope || (req as any).actorId) return next();
  return res.status(401).json({ error: 'unauthenticated' });
}

export function validateAndSanitizeApiInput(req: Request, res: Response, next: NextFunction) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const query = req.query && typeof req.query === 'object' ? req.query : {};
  const bodyResult = requestObject.safeParse(body);
  const queryResult = requestObject.safeParse(query);
  if (
    !bodyResult.success ||
    !queryResult.success ||
    containsMalformedInput(body) ||
    containsMalformedInput(query)
  ) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  req.body = sanitizeValue(body);
  req.query = sanitizeValue(query);
  if (req.method.toUpperCase() === 'GET') {
    const currentLimit = Number((req.query as any).limit ?? 25);
    if (Number.isFinite(currentLimit)) {
      (req.query as any).limit = String(Math.min(Math.max(Math.floor(currentLimit), 1), 100));
    }
    const currentOffset = Number((req.query as any).offset ?? 0);
    if (Number.isFinite(currentOffset)) {
      (req.query as any).offset = String(Math.max(Math.floor(currentOffset), 0));
    }
  }
  next();
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) return next();
  if (isPublicRoute(req) || (req as any).apiKeyScope) return next();
  const token = String(req.header('x-csrf-token') || '');
  const actor = String((req as any).actorId || '');
  const secret = process.env.CSRF_SECRET || process.env.SUPABASE_SERVICE_KEY || 'victorysync-csrf-dev';
  const expected = actor
    ? crypto.createHmac('sha256', secret).update(`${actor}:${new Date().toISOString().slice(0, 10)}`).digest('hex')
    : '';
  if (!actor || token !== expected) {
    return res.status(403).json({ error: 'csrf_validation_failed' });
  }
  next();
}

export function createCsrfToken(actorId: string) {
  const secret = process.env.CSRF_SECRET || process.env.SUPABASE_SERVICE_KEY || 'victorysync-csrf-dev';
  return crypto.createHmac('sha256', secret).update(`${actorId}:${new Date().toISOString().slice(0, 10)}`).digest('hex');
}
