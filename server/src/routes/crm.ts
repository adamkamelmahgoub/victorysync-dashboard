import express from 'express';
import { z } from 'zod';
import { isPlatformAdmin } from '../auth/rbac';
import { supabaseAdmin } from '../lib/supabaseClient';

const router = express.Router();
const uuid = z.string().uuid();
const optionalText = z.string().trim().max(5000).nullable().optional();
const customFields = z.record(z.string(), z.unknown()).optional();

const companyInput = z.object({
  organization_id: uuid,
  name: z.string().trim().min(1).max(240),
  phone: optionalText,
  city: optionalText,
  state: optionalText,
  industry: optionalText,
  source: optionalText,
  notes: optionalText,
  tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  custom_fields: customFields,
}).strict();

const companyPatch = companyInput.omit({ organization_id: true }).partial().strict();

const contactInput = z.object({
  organization_id: uuid,
  company_id: uuid.nullable().optional(),
  source_lead_id: uuid.nullable().optional(),
  first_name: z.string().trim().min(1).max(120),
  last_name: optionalText,
  title: optionalText,
  phone: optionalText,
  email: z.string().trim().email().max(320).nullable().optional().or(z.literal('')),
  tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  custom_fields: customFields,
}).strict();

const contactPatch = contactInput.omit({ organization_id: true }).partial().strict();

const dealInput = z.object({
  organization_id: uuid,
  company_id: uuid,
  primary_contact_id: uuid.nullable().optional(),
  stage_id: uuid,
  title: z.string().trim().min(1).max(240),
  next_action: optionalText,
  assigned_to: uuid.nullable().optional(),
  source_lead_id: uuid.nullable().optional(),
  custom_fields: customFields,
}).strict();

const dealPatch = dealInput.omit({ organization_id: true }).partial().strict();

const activityInput = z.object({
  organization_id: uuid,
  company_id: uuid,
  contact_id: uuid.nullable().optional(),
  deal_id: uuid.nullable().optional(),
  type: z.enum(['call', 'note', 'email']),
  body: z.string().trim().max(10000).nullable().optional(),
  occurred_at: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

const taskInput = z.object({
  organization_id: uuid,
  company_id: uuid,
  contact_id: uuid.nullable().optional(),
  deal_id: uuid.nullable().optional(),
  title: z.string().trim().min(1).max(240),
  description: optionalText,
  due_date: z.string().datetime(),
  assigned_to: uuid.nullable().optional(),
}).strict();

function actorId(req: express.Request) {
  const id = String((req as any).actorId || '');
  if (!id) throw Object.assign(new Error('unauthenticated'), { status: 401 });
  return id;
}

async function requireOrgAccess(userId: string, orgId: string) {
  void orgId;
  if (!(await isPlatformAdmin(userId))) throw Object.assign(new Error('forbidden'), { status: 403 });
}

async function resolveInternalCrmOrg(requested?: string | null) {
  if (requested) return uuid.parse(requested);
  const configured = String(process.env.VICTORYSYNC_DEFAULT_ORG_ID || '').trim();
  if (configured) return uuid.parse(configured);
  const { data, error } = await supabaseAdmin.from('organizations').select('id,name').order('created_at').limit(100);
  if (error) throw error;
  const organizations = data || [];
  const internal = organizations.find((org: any) => /victory\s*sync/i.test(String(org.name || '')));
  if (!internal?.id) throw Object.assign(new Error('internal_crm_organization_not_configured'), { status: 409 });
  return String(internal.id);
}

async function loadOwned(table: string, id: string) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('not_found'), { status: 404 });
  return data as any;
}

async function validateRelations(orgId: string, input: Record<string, any>) {
  const checks: Array<[string, string | null | undefined]> = [
    ['crm_companies', input.company_id],
    ['crm_contacts', input.primary_contact_id],
    ['crm_pipeline_stages', input.stage_id],
  ];
  for (const [table, id] of checks) {
    if (!id) continue;
    const row = await loadOwned(table, id);
    if (row.organization_id !== orgId) {
      throw Object.assign(new Error('cross_organization_reference'), { status: 400 });
    }
  }
}

function sendError(res: express.Response, error: any, fallback: string) {
  const status = Number(error?.status || (error instanceof z.ZodError ? 400 : 500));
  res.status(status).json({
    error: error instanceof z.ZodError ? 'invalid_request' : error?.message || fallback,
    ...(error instanceof z.ZodError ? { issues: error.issues } : {}),
  });
}

router.get('/crm/bootstrap', async (req, res) => {
  try {
    const userId = actorId(req);
    const orgId = await resolveInternalCrmOrg(String(req.query.organization_id || '').trim() || null);
    await requireOrgAccess(userId, orgId);
    const [stagesResult, dealsResult, companiesResult, contactsResult] = await Promise.all([
      supabaseAdmin.from('crm_pipeline_stages').select('*').eq('organization_id', orgId).order('position'),
      supabaseAdmin.from('crm_deals').select('*, company:crm_companies(*), primary_contact:crm_contacts(*)').eq('organization_id', orgId).order('updated_at', { ascending: false }),
      supabaseAdmin.from('crm_companies').select('*').eq('organization_id', orgId).order('name'),
      supabaseAdmin.from('crm_contacts').select('*, company:crm_companies(id,name)').eq('organization_id', orgId).order('last_name'),
    ]);
    for (const result of [stagesResult, dealsResult, companiesResult, contactsResult]) {
      if (result.error) throw result.error;
    }
    res.json({
      stages: stagesResult.data || [],
      deals: dealsResult.data || [],
      companies: companiesResult.data || [],
      contacts: contactsResult.data || [], organization_id: orgId,
    });
  } catch (error) { sendError(res, error, 'crm_bootstrap_failed'); }
});

router.get('/crm/companies/:companyId', async (req, res) => {
  try {
    const userId = actorId(req);
    const company = await loadOwned('crm_companies', uuid.parse(req.params.companyId));
    await requireOrgAccess(userId, company.organization_id);
    const [contacts, deals, activities, tasks] = await Promise.all([
      supabaseAdmin.from('crm_contacts').select('*').eq('company_id', company.id).order('last_name'),
      supabaseAdmin.from('crm_deals').select('*, stage:crm_pipeline_stages(*)').eq('company_id', company.id).order('updated_at', { ascending: false }),
      supabaseAdmin.from('crm_activities').select('*').eq('company_id', company.id).order('occurred_at', { ascending: false }).limit(100),
      supabaseAdmin.from('crm_tasks').select('*').eq('company_id', company.id).order('due_date'),
    ]);
    if (contacts.error) throw contacts.error;
    if (deals.error) throw deals.error;
    if (activities.error) throw activities.error;
    if (tasks.error) throw tasks.error;
    res.json({ item: company, contacts: contacts.data || [], deals: deals.data || [], activities: activities.data || [], tasks: tasks.data || [] });
  } catch (error) { sendError(res, error, 'crm_company_fetch_failed'); }
});

router.post('/crm/companies', async (req, res) => {
  try {
    const userId = actorId(req);
    const input = companyInput.parse(req.body);
    await requireOrgAccess(userId, input.organization_id);
    const { data, error } = await supabaseAdmin.from('crm_companies')
      .insert({ ...input, created_by: userId }).select('*').single();
    if (error) throw error;
    res.status(201).json({ item: data });
  } catch (error) { sendError(res, error, 'crm_company_create_failed'); }
});

router.patch('/crm/companies/:companyId', async (req, res) => {
  try {
    const userId = actorId(req);
    const existing = await loadOwned('crm_companies', uuid.parse(req.params.companyId));
    await requireOrgAccess(userId, existing.organization_id);
    const patch = companyPatch.parse(req.body);
    const { data, error } = await supabaseAdmin.from('crm_companies').update(patch).eq('id', existing.id).select('*').single();
    if (error) throw error;
    res.json({ item: data });
  } catch (error) { sendError(res, error, 'crm_company_update_failed'); }
});

router.post('/crm/contacts', async (req, res) => {
  try {
    const userId = actorId(req);
    const input = contactInput.parse(req.body);
    await requireOrgAccess(userId, input.organization_id);
    await validateRelations(input.organization_id, input);
    const payload = { ...input, email: input.email || null, created_by: userId };
    const { data, error } = await supabaseAdmin.from('crm_contacts').insert(payload).select('*').single();
    if (error) throw error;
    res.status(201).json({ item: data });
  } catch (error) { sendError(res, error, 'crm_contact_create_failed'); }
});

router.patch('/crm/contacts/:contactId', async (req, res) => {
  try {
    const userId = actorId(req);
    const existing = await loadOwned('crm_contacts', uuid.parse(req.params.contactId));
    await requireOrgAccess(userId, existing.organization_id);
    const patch = contactPatch.parse(req.body);
    await validateRelations(existing.organization_id, { company_id: patch.company_id });
    const { data, error } = await supabaseAdmin.from('crm_contacts').update({ ...patch, email: patch.email || null }).eq('id', existing.id).select('*').single();
    if (error) throw error;
    res.json({ item: data });
  } catch (error) { sendError(res, error, 'crm_contact_update_failed'); }
});

router.post('/crm/deals', async (req, res) => {
  try {
    const userId = actorId(req);
    const input = dealInput.parse(req.body);
    await requireOrgAccess(userId, input.organization_id);
    await validateRelations(input.organization_id, input);
    const { data, error } = await supabaseAdmin.from('crm_deals')
      .insert({ ...input, created_by: userId }).select('*, company:crm_companies(*), primary_contact:crm_contacts(*)').single();
    if (error) throw error;
    res.status(201).json({ item: data });
  } catch (error) { sendError(res, error, 'crm_deal_create_failed'); }
});

router.patch('/crm/deals/:dealId', async (req, res) => {
  try {
    const userId = actorId(req);
    const existing = await loadOwned('crm_deals', uuid.parse(req.params.dealId));
    await requireOrgAccess(userId, existing.organization_id);
    const patch = dealPatch.parse(req.body);
    await validateRelations(existing.organization_id, patch);
    const stageChanged = Boolean(patch.stage_id && patch.stage_id !== existing.stage_id);
    const update = { ...patch, ...(stageChanged ? { stage_changed_at: new Date().toISOString() } : {}) };
    const { data, error } = await supabaseAdmin.from('crm_deals').update(update).eq('id', existing.id)
      .select('*, company:crm_companies(*), primary_contact:crm_contacts(*)').single();
    if (error) throw error;
    if (stageChanged) {
      await supabaseAdmin.from('crm_activities').insert({
        organization_id: existing.organization_id,
        company_id: patch.company_id || existing.company_id,
        contact_id: patch.primary_contact_id === undefined ? existing.primary_contact_id : patch.primary_contact_id,
        deal_id: existing.id,
        type: 'stage_change',
        body: 'Pipeline stage changed',
        created_by: userId,
        metadata: { from_stage_id: existing.stage_id, to_stage_id: patch.stage_id },
      });
    }
    res.json({ item: data });
  } catch (error) { sendError(res, error, 'crm_deal_update_failed'); }
});

router.post('/crm/activities', async (req, res) => {
  try {
    const userId = actorId(req);
    const input = activityInput.parse(req.body);
    await requireOrgAccess(userId, input.organization_id);
    await validateRelations(input.organization_id, {
      company_id: input.company_id,
      primary_contact_id: input.contact_id,
    });
    let deal: any = null;
    if (input.deal_id) {
      deal = await loadOwned('crm_deals', input.deal_id);
      if (deal.organization_id !== input.organization_id || deal.company_id !== input.company_id) {
        throw Object.assign(new Error('cross_organization_reference'), { status: 400 });
      }
    }
    const { data, error } = await supabaseAdmin.from('crm_activities').insert({
      ...input, occurred_at: input.occurred_at || new Date().toISOString(), created_by: userId,
    }).select('*').single();
    if (error) throw error;

    let advanced_to_stage_id: string | null = null;
    const outcome = input.type === 'call' ? String(input.metadata?.outcome || '').trim() : '';
    if (deal && outcome) {
      const { data: mapping } = await supabaseAdmin.from('call_outcome_stage_mappings')
        .select('target_stage_id, enabled').eq('organization_id', input.organization_id).eq('outcome', outcome).maybeSingle();
      if (mapping?.enabled && mapping.target_stage_id !== deal.stage_id) {
        const target = await loadOwned('crm_pipeline_stages', mapping.target_stage_id);
        if (target.organization_id === input.organization_id) {
          await supabaseAdmin.from('crm_deals').update({ stage_id: target.id, stage_changed_at: new Date().toISOString() }).eq('id', deal.id);
          await supabaseAdmin.from('crm_activities').insert({
            organization_id: input.organization_id, company_id: input.company_id,
            contact_id: input.contact_id || deal.primary_contact_id, deal_id: deal.id,
            type: 'stage_change', body: `Stage automatically changed to ${target.name}`,
            created_by: userId, metadata: { from_stage_id: deal.stage_id, to_stage_id: target.id, call_outcome: outcome },
          });
          advanced_to_stage_id = target.id;
        }
      }
    }
    res.status(201).json({ item: data, advanced_to_stage_id });
  } catch (error) { sendError(res, error, 'crm_activity_create_failed'); }
});

router.post('/crm/tasks', async (req, res) => {
  try {
    const userId = actorId(req);
    const input = taskInput.parse(req.body);
    await requireOrgAccess(userId, input.organization_id);
    await validateRelations(input.organization_id, { company_id: input.company_id, primary_contact_id: input.contact_id });
    if (input.deal_id) {
      const deal = await loadOwned('crm_deals', input.deal_id);
      if (deal.organization_id !== input.organization_id) throw Object.assign(new Error('cross_organization_reference'), { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from('crm_tasks').insert({
      ...input, assigned_to: input.assigned_to || userId, created_by: userId,
    }).select('*').single();
    if (error) throw error;
    await supabaseAdmin.from('crm_activities').insert({
      organization_id: input.organization_id, company_id: input.company_id,
      contact_id: input.contact_id, deal_id: input.deal_id, type: 'task',
      body: `Task created: ${input.title}`, created_by: userId,
      metadata: { task_id: data.id, due_date: input.due_date },
    });
    res.status(201).json({ item: data });
  } catch (error) { sendError(res, error, 'crm_task_create_failed'); }
});

router.patch('/crm/tasks/:taskId', async (req, res) => {
  try {
    const userId = actorId(req);
    const existing = await loadOwned('crm_tasks', uuid.parse(req.params.taskId));
    await requireOrgAccess(userId, existing.organization_id);
    const patch = z.object({ completed: z.boolean() }).strict().parse(req.body);
    const { data, error } = await supabaseAdmin.from('crm_tasks').update({
      completed: patch.completed, completed_at: patch.completed ? new Date().toISOString() : null,
    }).eq('id', existing.id).select('*').single();
    if (error) throw error;
    await supabaseAdmin.from('crm_activities').insert({
      organization_id: existing.organization_id, company_id: existing.company_id,
      contact_id: existing.contact_id, deal_id: existing.deal_id, type: 'task',
      body: patch.completed ? `Task completed: ${existing.title}` : `Task reopened: ${existing.title}`,
      created_by: userId, metadata: { task_id: existing.id, completed: patch.completed },
    });
    res.json({ item: data });
  } catch (error) { sendError(res, error, 'crm_task_update_failed'); }
});

router.get('/crm/dashboard', async (req, res) => {
  try {
    const userId = actorId(req);
    const orgId = await resolveInternalCrmOrg(String(req.query.organization_id || '').trim() || null);
    await requireOrgAccess(userId, orgId);
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const week = new Date(today); week.setDate(week.getDate() - 6);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const [callsToday, callsWeek, companiesToday, stageChangesToday, stageChangesWeek, stages, deals, tasks] = await Promise.all([
      supabaseAdmin.from('crm_activities').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('type', 'call').gte('occurred_at', today.toISOString()),
      supabaseAdmin.from('crm_activities').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('type', 'call').gte('occurred_at', week.toISOString()),
      supabaseAdmin.from('crm_companies').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).gte('created_at', today.toISOString()),
      supabaseAdmin.from('crm_activities').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('type', 'stage_change').gte('occurred_at', today.toISOString()),
      supabaseAdmin.from('crm_activities').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('type', 'stage_change').gte('occurred_at', week.toISOString()),
      supabaseAdmin.from('crm_pipeline_stages').select('id,name').eq('organization_id', orgId),
      supabaseAdmin.from('crm_deals').select('id,stage_id').eq('organization_id', orgId),
      supabaseAdmin.from('crm_tasks').select('*, company:crm_companies(id,name)').eq('organization_id', orgId).eq('assigned_to', userId).eq('completed', false).gte('due_date', today.toISOString()).lt('due_date', tomorrow.toISOString()).order('due_date'),
    ]);
    const stageByName = new Map((stages.data || []).map((stage: any) => [stage.name, stage.id]));
    const trialActive = (deals.data || []).filter((deal: any) => deal.stage_id === stageByName.get('Trial Active')).length;
    const awaitingClose = (deals.data || []).filter((deal: any) => deal.stage_id === stageByName.get('Trial Completed')).length;
    res.json({ metrics: { calls_today: callsToday.count || 0, calls_week: callsWeek.count || 0, companies_today: companiesToday.count || 0, stage_changes_today: stageChangesToday.count || 0, stage_changes_week: stageChangesWeek.count || 0, trials_active: trialActive, awaiting_close: awaitingClose }, tasks: tasks.data || [] });
  } catch (error) { sendError(res, error, 'crm_dashboard_failed'); }
});

export default router;
