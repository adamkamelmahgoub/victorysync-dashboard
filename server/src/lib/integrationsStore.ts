import crypto from 'crypto';
import { supabaseAdmin } from './supabaseClient';

const ALGO = 'aes-256-gcm';

function getKey() {
  const k = process.env.INTEGRATIONS_KEY || process.env.SERVICE_KEY || process.env.SERVER_SERVICE_KEY || null;
  if (!k) throw new Error('INTEGRATIONS_KEY not set');
  // allow raw 32-byte hex or base64
  if (/^[0-9a-fA-F]{64}$/.test(k)) return Buffer.from(k, 'hex');
  try { return Buffer.from(k, 'base64'); } catch (e) { return Buffer.from(k); }
}

export function encryptObj(obj: any) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const text = JSON.stringify(obj);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptObj(payloadB64: string) {
  const key = getKey();
  const buf = Buffer.from(payloadB64, 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const enc = buf.slice(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const txt = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  return JSON.parse(txt);
}

export async function saveOrgIntegration(orgId: string, provider: string, credentials: any, meta: any = {}) {
  const encrypted = encryptObj(credentials);
  const payload = {
    org_id: orgId,
    provider,
    encrypted_credentials: encrypted,
    metadata: meta
  };
  const { data, error } = await supabaseAdmin
    .from('org_integrations')
    .upsert(payload, { onConflict: 'org_id,provider' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getOrgIntegration(orgId: string, provider: string) {
  const { data, error } = await supabaseAdmin
    .from('org_integrations')
    .select('*')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  try {
    const creds = decryptObj(data.encrypted_credentials);
    return { ...data, credentials: creds };
  } catch (e) {
    console.warn('[integrationsStore] decrypt failed', e);
    return { ...data, credentials: null };
  }
}

export async function deleteOrgIntegration(orgId: string, provider: string) {
  const { error } = await supabaseAdmin
    .from('org_integrations')
    .delete()
    .eq('org_id', orgId)
    .eq('provider', provider);
  if (error) throw error;
  return true;
}

export default { encryptObj, decryptObj, saveOrgIntegration, getOrgIntegration, deleteOrgIntegration };
