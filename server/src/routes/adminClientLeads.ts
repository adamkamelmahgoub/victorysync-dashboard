import express from 'express';
import { z } from 'zod';
import { isPlatformAdmin } from '../auth/rbac';
import { supabaseAdmin } from '../lib/supabaseClient';
import { writeAuditLog } from '../lib/audit';

const router = express.Router();

const STATUSES = ['new', 'working', 'contacted', 'qualified', 'follow_up', 'closed'] as const;
const DISPOSITIONS = ['unworked', 'no_answer', 'voicemail', 'callback', 'interested', 'not_interested', 'wrong_number', 'do_not_contact', 'converted'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

const nullableText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional();
const leadSchema = z.object({
  first_name: nullableText(100),
  last_name: nullableText(100),
  phone: nullableText(40),
  email: z.union([z.string().trim().email().max(255), z.literal(''), z.null()]).optional(),
  company: nullableText(200),
  source: nullableText(200),
  status: z.enum(STATUSES).optional(),
  disposition: z.enum(DISPOSITIONS).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigned_to: nullableText(200),
  attempts: z.coerce.number().int().min(0).max(100000).optional(),
  last_contacted_at: z.union([z.string().datetime(), z.literal(''), z.null()]).optional(),
  next_follow_up_at: z.union([z.string().datetime(), z.literal(''), z.null()]).optional(),
  do_not_contact: z.boolean().optional(),
  notes: nullableText(10000),
});

function actorId(req: express.Request) {
  return String(req.actorId || req.header('x-user-id') || '');
}

async function actorName(id: string) {
  const { data } = await supabaseAdmin.from('profiles').select('full_name, email').eq('id', id).maybeSingle();
  return data?.full_name || data?.email || 'Platform admin';
}

function cleanPayload(value: Record<string, any>) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item === '' ? null : item]));
}

router.use(async (req, res, next) => {
  const id = actorId(req);
  if (!id) return res.status(401).json({ error: 'unauthenticated' });
  if (!(await isPlatformAdmin(id))) return res.status(403).json({ error: 'forbidden' });
  next();
});

router.get('/clients/:orgId/leads', async (req, res) => {
  try {
    const orgId = String(req.params.orgId);
    const limit = Math.min(Math.max(Number(req.query.limit || 250), 1), 1000);
    let query = supabaseAdmin.from('admin_client_leads').select('*', { count: 'exact' })
      .eq('organization_id', orgId).order('updated_at', { ascending: false }).limit(limit);
    if (req.query.status) query = query.eq('status', String(req.query.status));
    if (req.query.disposition) query = query.eq('disposition', String(req.query.disposition));
    if (req.query.priority) query = query.eq('priority', String(req.query.priority));
    if (req.query.search) {
      const term = String(req.query.search).replace(/[%_,]/g, '').slice(0, 100);
      query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ items: data || [], count: count || 0 });
  } catch (error: any) {
    res.status(500).json({ error: 'admin_client_leads_fetch_failed', detail: error?.message });
  }
});

router.post('/clients/:orgId/leads', async (req, res) => {
  try {
    const parsed = leadSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_lead', issues: parsed.error.issues });
    const payload = cleanPayload(parsed.data);
    if (!payload.phone && !payload.email) return res.status(400).json({ error: 'phone_or_email_required' });
    const id = actorId(req);
    const orgId = String(req.params.orgId);
    const { data, error } = await supabaseAdmin.from('admin_client_leads').insert({
      ...payload, organization_id: orgId, created_by: id,
    }).select('*').single();
    if (error) throw error;
    await supabaseAdmin.from('admin_client_lead_activities').insert({
      lead_id: data.id, organization_id: orgId, activity_type: 'created', summary: 'Lead created',
      changes: payload, actor_id: id, actor_name: await actorName(id),
    });
    await writeAuditLog({ actor_id: id, action: 'admin_client_lead_created', org_id: orgId, entity_type: 'admin_client_lead', entity_id: data.id });
    res.status(201).json({ item: data });
  } catch (error: any) {
    res.status(500).json({ error: 'admin_client_lead_create_failed', detail: error?.message });
  }
});

router.post('/clients/:orgId/leads/import', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length || rows.length > 1000) return res.status(400).json({ error: 'rows_must_be_between_1_and_1000' });
    const id = actorId(req);
    const orgId = String(req.params.orgId);
    const valid: Record<string, any>[] = [];
    const rejected: Array<{ row: number; reason: string }> = [];
    rows.forEach((row: any, index: number) => {
      const normalized = {
        first_name: row.first_name || row.firstName || row['First Name'] || null,
        last_name: row.last_name || row.lastName || row['Last Name'] || null,
        phone: row.phone || row.phone_number || row['Phone'] || row['Phone Number'] || null,
        email: row.email || row.Email || null,
        company: row.company || row.Company || null,
        source: row.source || row.Source || 'csv_import',
        assigned_to: row.assigned_to || row.assignedTo || row['Assigned To'] || null,
        priority: String(row.priority || row.Priority || 'normal').toLowerCase(),
        notes: row.notes || row.Notes || null,
      };
      const parsed = leadSchema.safeParse(normalized);
      if (!parsed.success || (!normalized.phone && !normalized.email)) rejected.push({ row: index + 2, reason: 'Invalid contact data' });
      else valid.push({ ...cleanPayload(parsed.data), organization_id: orgId, created_by: id, raw_payload: row });
    });
    if (!valid.length) return res.status(400).json({ error: 'no_valid_rows', rejected });
    const { data, error } = await supabaseAdmin.from('admin_client_leads').insert(valid).select('id');
    if (error) throw error;
    const name = await actorName(id);
    await supabaseAdmin.from('admin_client_lead_activities').insert((data || []).map((lead: any) => ({
      lead_id: lead.id, organization_id: orgId, activity_type: 'imported', summary: 'Lead imported from CSV', actor_id: id, actor_name: name,
    })));
    await writeAuditLog({ actor_id: id, action: 'admin_client_leads_imported', org_id: orgId, metadata: { inserted: data?.length || 0, rejected: rejected.length } });
    res.status(201).json({ inserted: data?.length || 0, rejected });
  } catch (error: any) {
    res.status(500).json({ error: 'admin_client_leads_import_failed', detail: error?.message });
  }
});

router.patch('/clients/:orgId/leads/:leadId', async (req, res) => {
  try {
    const parsed = leadSchema.partial().safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_lead_update', issues: parsed.error.issues });
    const orgId = String(req.params.orgId);
    const leadId = String(req.params.leadId);
    const { data: before } = await supabaseAdmin.from('admin_client_leads').select('*').eq('id', leadId).eq('organization_id', orgId).maybeSingle();
    if (!before) return res.status(404).json({ error: 'lead_not_found' });
    const patch = cleanPayload(parsed.data);
    if (patch.disposition === 'do_not_contact') patch.do_not_contact = true;
    const { data, error } = await supabaseAdmin.from('admin_client_leads').update(patch).eq('id', leadId).eq('organization_id', orgId).select('*').single();
    if (error) throw error;
    const changes = Object.fromEntries(Object.entries(patch).filter(([key, value]) => before[key] !== value).map(([key, value]) => [key, { from: before[key], to: value }]));
    const id = actorId(req);
    await supabaseAdmin.from('admin_client_lead_activities').insert({
      lead_id: leadId, organization_id: orgId, activity_type: 'updated', summary: 'Lead details updated', changes, actor_id: id, actor_name: await actorName(id),
    });
    await writeAuditLog({ actor_id: id, action: 'admin_client_lead_updated', org_id: orgId, entity_type: 'admin_client_lead', entity_id: leadId, metadata: { changes } });
    res.json({ item: data });
  } catch (error: any) {
    res.status(500).json({ error: 'admin_client_lead_update_failed', detail: error?.message });
  }
});

router.get('/clients/:orgId/leads/:leadId/activity', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('admin_client_lead_activities').select('*')
      .eq('organization_id', String(req.params.orgId)).eq('lead_id', String(req.params.leadId))
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: 'admin_client_lead_activity_failed', detail: error?.message });
  }
});

router.post('/clients/:orgId/leads/:leadId/notes', async (req, res) => {
  try {
    const note = String(req.body?.note || '').trim().slice(0, 5000);
    if (!note) return res.status(400).json({ error: 'note_required' });
    const orgId = String(req.params.orgId);
    const leadId = String(req.params.leadId);
    const { data: lead } = await supabaseAdmin.from('admin_client_leads').select('id').eq('id', leadId).eq('organization_id', orgId).maybeSingle();
    if (!lead) return res.status(404).json({ error: 'lead_not_found' });
    const id = actorId(req);
    const { data, error } = await supabaseAdmin.from('admin_client_lead_activities').insert({
      lead_id: leadId, organization_id: orgId, activity_type: 'note', summary: note, actor_id: id, actor_name: await actorName(id),
    }).select('*').single();
    if (error) throw error;
    await writeAuditLog({ actor_id: id, action: 'admin_client_lead_note_added', org_id: orgId, entity_type: 'admin_client_lead', entity_id: leadId });
    res.status(201).json({ item: data });
  } catch (error: any) {
    res.status(500).json({ error: 'admin_client_lead_note_failed', detail: error?.message });
  }
});

export default router;
