import fetch from 'node-fetch';
import { MIGHTYCALL_API_KEY, MIGHTYCALL_BASE_URL, MIGHTYCALL_USER_KEY } from '../config/env';

const BASE_URL = (
  process.env.MIGHTYCALL_API_BASE_URL ||
  MIGHTYCALL_BASE_URL ||
  'https://ccapi.mightycall.com/v4'
).replace(/\/$/, '');

const REQUEST_TIMEOUT_MS = 15_000;
let cachedToken: { accessToken: string; expiresAt: number } | null = null;
const unsupportedPaths = new Set<string>();

function redact(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/client_secret=[^&\s]+/gi, 'client_secret=[redacted]')
    .replace(/client_id=[^&\s]+/gi, 'client_id=[redacted]');
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMightyCallToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.accessToken;
  const apiKey = process.env.MIGHTYCALL_API_KEY || MIGHTYCALL_API_KEY;
  const userKey = process.env.MIGHTYCALL_USER_KEY || MIGHTYCALL_USER_KEY;
  if (!apiKey || !userKey) throw new Error('Missing MIGHTYCALL_API_KEY or MIGHTYCALL_USER_KEY');

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', apiKey);
  body.set('client_secret', userKey);

  const response = await withTimeout((signal) => fetch(`${BASE_URL}/auth/token`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    signal: signal as any,
  }));

  const text = await response.text();
  if (!response.ok) throw new Error(redact(`MightyCall auth failed: ${response.status} ${text}`));
  const data = JSON.parse(text || '{}');
  const token = data.access_token || data.token || data.data?.access_token || data.result?.access_token;
  if (!token) throw new Error('MightyCall auth failed: response did not include an access token');
  const expiresIn = Number(data.expires_in || data.expiresIn || 24 * 60 * 60);
  cachedToken = {
    accessToken: String(token),
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  };
  return cachedToken.accessToken;
}

export async function mightyCallGet<T>(
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const token = await getMightyCallToken();
  const apiKey = process.env.MIGHTYCALL_API_KEY || MIGHTYCALL_API_KEY || '';
  const url = new URL(`${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const response = await withTimeout((signal) => fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': apiKey,
      Accept: 'application/json',
    },
    signal: signal as any,
  }));
  const text = await response.text();
  if (!response.ok) throw new Error(redact(`MightyCall GET ${path} failed: ${response.status} ${text}`));
  return JSON.parse(text || 'null') as T;
}

export async function mightyCallPost<T>(path: string, payload?: unknown): Promise<T> {
  const token = await getMightyCallToken();
  const apiKey = process.env.MIGHTYCALL_API_KEY || MIGHTYCALL_API_KEY || '';
  const response = await withTimeout((signal) => fetch(`${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: signal as any,
  }));
  const text = await response.text();
  if (!response.ok) throw new Error(redact(`MightyCall POST ${path} failed: ${response.status} ${text}`));
  return JSON.parse(text || 'null') as T;
}

export async function mightyCallGetFirst<T>(
  paths: string[],
  query?: Record<string, string | number | boolean | undefined>,
  options: { optional?: boolean } = {}
): Promise<{ path: string | null; data: T | null; unsupported?: boolean; errors: string[] }> {
  const errors: string[] = [];
  for (const path of paths) {
    if (unsupportedPaths.has(path)) continue;
    try {
      const data = await mightyCallGet<T>(path, query);
      return { path, data, errors };
    } catch (err: any) {
      const message = String(err?.message || err);
      errors.push(redact(message));
      if (/404|405|not found|not allowed/i.test(message)) unsupportedPaths.add(path);
    }
  }
  if (options.optional) return { path: null, data: null, unsupported: true, errors };
  throw new Error(errors[0] || `MightyCall endpoint not available: ${paths.join(', ')}`);
}

export function getMightyCallApiBaseUrl() {
  return BASE_URL;
}
