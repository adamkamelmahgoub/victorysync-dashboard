import { supabaseAdmin } from './supabaseClient';

export type AuditLogPayload = {
  actor_id?: string | null;
  action: string;
  org_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: any;
};

export async function writeAuditLog(payload: AuditLogPayload) {
  const row = {
    actor_id: payload.actor_id || null,
    action: payload.action,
    org_id: payload.org_id || null,
    entity_type: payload.entity_type || null,
    entity_id: payload.entity_id || null,
    metadata: payload.metadata || {},
    created_at: new Date().toISOString(),
  };
  try {
    const { error } = await supabaseAdmin.from('audit_logs').insert(row);
    if (error) {
      console.warn('[audit] insert failed:', error.message || error);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('[audit] exception:', err?.message || err);
    return false;
  }
}
