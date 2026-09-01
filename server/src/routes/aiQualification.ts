import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { isPlatformAdmin } from '../auth/rbac';
import { supabaseAdmin } from '../lib/supabaseClient';
import { getVoiceAdapter } from '../services/voiceAdapter';
import { scoreQualification } from '../services/qualificationEngine';
import { syncLeadToHubSpot } from '../services/hubspotSync';
import { getOrgIntegration, saveOrgIntegration } from '../lib/integrationsStore';
import fetch from 'node-fetch';

const router = Router();
const uuid = z.string().uuid();
const initiateSchema = z.object({ lead_id: uuid, campaign_id: uuid.optional() });
const qualifySchema = z.object({ call_id: uuid });
const routeSchema = z.object({ lead_id: uuid, qualification_result_id: uuid.optional() });

async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const actorId = String(req.actorId || req.header('x-user-id') || '');
  if (!actorId || !(await isPlatformAdmin(actorId))) return res.status(403).json({ error: 'forbidden' });
  next();
}

function dbError(error: any) {
  const message = String(error?.message || 'database_error');
  return message.includes('does not exist') ? 'ai_engine_migration_required' : 'database_error';
}

async function qualifyCall(callId: string) {
  const { data: call, error: callError } = await supabaseAdmin
    .from('ai_calls')
    .select('id, lead_id, transcript, outcome, campaign_id, ai_campaigns(qualification_config, organization_id)')
    .eq('id', callId)
    .maybeSingle();
  if (callError) throw callError;
  if (!call) throw new Error('call_not_found');
  const campaign: any = Array.isArray((call as any).ai_campaigns) ? (call as any).ai_campaigns[0] : (call as any).ai_campaigns;
  const result = scoreQualification(call.transcript || '', call.outcome || '', campaign?.qualification_config || {});
  const { data: saved, error: resultError } = await supabaseAdmin
    .from('qualification_results')
    .upsert({
      call_id: call.id,
      score: result.score,
      qualified: result.qualified,
      reasoning: result.reasoning,
      next_action: result.nextAction,
      scoring_version: 'pilot-v1',
    }, { onConflict: 'call_id' })
    .select('*')
    .single();
  if (resultError) throw resultError;
  const { error: leadError } = await supabaseAdmin.from('leads').update({
    status: result.nextAction === 'escalate_to_human' ? 'qualified' : result.qualified ? 'ai_resolved' : 'unqualified',
    ai_resolution: result.nextAction,
    qualification_score: result.score,
    qualified_at: result.qualified ? new Date().toISOString() : null,
  }).eq('id', call.lead_id);
  if (leadError) throw leadError;
  return { result: saved, leadId: call.lead_id };
}

async function routeLead(leadId: string, qualificationResultId?: string) {
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads')
    .select('id, hubspot_contact_id, ai_resolution, organization_id, ai_campaign_id, ai_campaigns(routing_config)')
    .eq('id', leadId)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead) throw new Error('lead_not_found');
  if (lead.ai_resolution !== 'escalate_to_human') throw new Error('lead_does_not_require_escalation');

  const { count } = await supabaseAdmin.from('lead_routing_events').select('id', { count: 'exact', head: true });
  const campaign: any = Array.isArray((lead as any).ai_campaigns) ? (lead as any).ai_campaigns[0] : (lead as any).ai_campaigns;
  const configuredAgents = Array.isArray(campaign?.routing_config?.agents) ? campaign.routing_config.agents : [];
  const agents = configuredAgents.length ? configuredAgents.map((agent: any) => ({ name: String(agent.name), id: agent.id || null })) : [
    { name: 'Rall', id: process.env.ROUTING_AGENT_RALL_ID || null }, { name: 'Shehab', id: process.env.ROUTING_AGENT_SHEHAB_ID || null },
  ];
  const agent = agents[(count || 0) % agents.length];
  const now = new Date().toISOString();
  const hubspot = await syncLeadToHubSpot(lead.organization_id, lead.hubspot_contact_id, {
    vs_status: 'escalate_to_human',
    vs_sequence_step: 'human_follow_up',
    vs_last_sent: now,
  });
  const { data: event, error: eventError } = await supabaseAdmin.from('lead_routing_events').insert({
    lead_id: leadId,
    qualification_result_id: qualificationResultId || null,
    assigned_agent: agent.name,
    assigned_agent_id: agent.id,
    hubspot_synced: hubspot.synced,
    hubspot_error: hubspot.error,
  }).select('*').single();
  if (eventError) throw eventError;
  await supabaseAdmin.from('leads').update({
    status: 'escalated_to_human',
    assigned_agent_id: agent.id,
    assigned_at: now,
  }).eq('id', leadId);
  return { event, hubspot };
}

router.post('/calls/initiate', requirePlatformAdmin, async (req, res) => {
  try {
    const input = initiateSchema.parse(req.body);
    const { data: lead, error: leadError } = await supabaseAdmin.from('leads').select('*').eq('id', input.lead_id).maybeSingle();
    if (leadError) throw leadError;
    if (!lead) return res.status(404).json({ error: 'lead_not_found' });
    const campaignId = input.campaign_id || lead.ai_campaign_id;
    if (!campaignId) return res.status(400).json({ error: 'campaign_id_required' });
    const { data: campaign, error: campaignError } = await supabaseAdmin.from('ai_campaigns').select('*').eq('id', campaignId).eq('active', true).maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign) return res.status(404).json({ error: 'active_campaign_not_found' });
    if (!campaign.organization_id) return res.status(400).json({ error: 'campaign_organization_required' });
    const adapter = await getVoiceAdapter(campaign.organization_id);
    const { data: call, error: callError } = await supabaseAdmin.from('ai_calls').insert({
      lead_id: lead.id, campaign_id: campaign.id, vendor: adapter.name, status: 'queued', ai_handled: true,
    }).select('*').single();
    if (callError) throw callError;
    try {
      const vendorCall = await adapter.initiate({ callId: call.id, to: lead.phone, lead, campaign });
      const { data: updated, error: updateError } = await supabaseAdmin.from('ai_calls').update({
        vendor_call_id: vendorCall.vendorCallId, status: vendorCall.status,
      }).eq('id', call.id).select('*').single();
      if (updateError) throw updateError;
      return res.status(202).json({ call: updated });
    } catch (error: any) {
      await supabaseAdmin.from('ai_calls').update({ status: 'initiation_failed', outcome: String(error?.message || 'initiation_failed') }).eq('id', call.id);
      throw error;
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'invalid_request', issues: error.issues });
    const rawCode = String(error?.message || '');
    const code = rawCode.startsWith('vapi_') ? rawCode : dbError(error);
    res.status(code === 'vapi_not_configured' ? 503 : 500).json({ error: code });
  }
});

router.post('/calls/webhook', async (req, res) => {
  try {
    const message = req.body?.message || req.body || {};
    const vendorCallId = String(message.call?.id || message.callId || '');
    if (!vendorCallId) return res.status(400).json({ error: 'vendor_call_id_required' });
    const { data: existing, error: lookupError } = await supabaseAdmin.from('ai_calls')
      .select('id, ai_campaigns(organization_id)').eq('vendor', 'vapi').eq('vendor_call_id', vendorCallId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return res.status(404).json({ error: 'call_not_found' });
    const campaign: any = Array.isArray((existing as any).ai_campaigns) ? (existing as any).ai_campaigns[0] : (existing as any).ai_campaigns;
    const receivedSecret = String(req.header('x-vapi-secret') || '').trim();
    const adapter = await getVoiceAdapter(String(campaign?.organization_id || ''), receivedSecret);
    if (!adapter.verifyWebhook()) return res.status(401).json({ error: 'invalid_webhook_secret' });
    const event = adapter.parseWebhook(req.body || {});
    if (!event.vendorCallId) return res.status(400).json({ error: 'vendor_call_id_required' });
    const { data: call, error } = await supabaseAdmin.from('ai_calls').update({
      status: event.status,
      transcript: event.transcript,
      outcome: event.outcome,
      started_at: event.startedAt,
      ended_at: event.endedAt,
      duration_seconds: event.durationSeconds,
      raw_payload: event.raw,
    }).eq('vendor', adapter.name).eq('vendor_call_id', event.vendorCallId).select('*').maybeSingle();
    if (error) throw error;
    if (!call) return res.status(404).json({ error: 'call_not_found' });
    const terminal = ['completed', 'ended', 'done'].some((value) => event.status.toLowerCase().includes(value));
    if (!terminal) return res.status(202).json({ received: true, qualified: false });
    const qualified = await qualifyCall(call.id);
    let routing = null;
    if (qualified.result.next_action === 'escalate_to_human') routing = await routeLead(qualified.leadId, qualified.result.id);
    res.json({ received: true, qualified: true, result: qualified.result, routing });
  } catch (error: any) {
    res.status(500).json({ error: dbError(error) });
  }
});

const settingsSchema = z.object({
  organization_id: uuid,
  campaign: z.object({
    id: uuid.optional(), name: z.string().min(1).max(160), client_name: z.string().min(1).max(160),
    active: z.boolean(), qualification_config: z.record(z.string(), z.any()),
    routing_config: z.record(z.string(), z.any()),
  }),
  vapi: z.object({ private_api_key: z.string().optional(), assistant_id: z.string().min(1), phone_number_id: z.string().min(1), webhook_secret: z.string().optional() }),
  hubspot: z.object({ access_token: z.string().optional() }),
});

router.get('/admin/ai-qualification/settings', requirePlatformAdmin, async (req, res) => {
  try {
    const orgId = uuid.parse(req.query.organization_id);
    const [{ data: campaigns, error }, vapi, hubspot] = await Promise.all([
      supabaseAdmin.from('ai_campaigns').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
      getOrgIntegration(orgId, 'vapi'), getOrgIntegration(orgId, 'hubspot_ai'),
    ]);
    if (error) throw error;
    res.json({ campaigns: campaigns || [], integrations: {
      vapi: { configured: Boolean(vapi?.credentials?.private_api_key), assistant_id: vapi?.credentials?.assistant_id || '', phone_number_id: vapi?.credentials?.phone_number_id || '', webhook_secret_configured: Boolean(vapi?.credentials?.webhook_secret) },
      hubspot: { configured: Boolean(hubspot?.credentials?.access_token) },
    }, webhook_url: `${process.env.PUBLIC_API_URL || 'https://api.victorysync.com'}/api/calls/webhook` });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'invalid_organization_id' });
    res.status(500).json({ error: dbError(error) });
  }
});

router.put('/admin/ai-qualification/settings', requirePlatformAdmin, async (req, res) => {
  try {
    const input = settingsSchema.parse(req.body);
    const currentVapi = await getOrgIntegration(input.organization_id, 'vapi');
    const currentHubspot = await getOrgIntegration(input.organization_id, 'hubspot_ai');
    const vapiCredentials = {
      private_api_key: input.vapi.private_api_key || currentVapi?.credentials?.private_api_key || '',
      assistant_id: input.vapi.assistant_id, phone_number_id: input.vapi.phone_number_id,
      webhook_secret: input.vapi.webhook_secret || currentVapi?.credentials?.webhook_secret || '',
    };
    if (!vapiCredentials.private_api_key || !vapiCredentials.webhook_secret) return res.status(400).json({ error: 'vapi_secrets_required' });
    const hubspotToken = input.hubspot.access_token || currentHubspot?.credentials?.access_token || '';
    const campaignPayload = { organization_id: input.organization_id, name: input.campaign.name, client_name: input.campaign.client_name,
      active: input.campaign.active, qualification_config: input.campaign.qualification_config, routing_config: input.campaign.routing_config, voice_config: { provider: 'vapi' } };
    const campaignQuery = input.campaign.id
      ? supabaseAdmin.from('ai_campaigns').update(campaignPayload).eq('id', input.campaign.id).eq('organization_id', input.organization_id)
      : supabaseAdmin.from('ai_campaigns').insert(campaignPayload);
    const { data: campaign, error } = await campaignQuery.select('*').single();
    if (error) throw error;
    await saveOrgIntegration(input.organization_id, 'vapi', vapiCredentials, { configured_from: 'ai_qualification_admin' });
    if (hubspotToken) await saveOrgIntegration(input.organization_id, 'hubspot_ai', { access_token: hubspotToken }, { configured_from: 'ai_qualification_admin' });
    res.json({ saved: true, campaign });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'invalid_settings', issues: error.issues });
    res.status(500).json({ error: dbError(error) });
  }
});

router.post('/admin/ai-qualification/test-connection', requirePlatformAdmin, async (req, res) => {
  try {
    const input = z.object({ organization_id: uuid, provider: z.enum(['vapi', 'hubspot']) }).parse(req.body);
    const integration = await getOrgIntegration(input.organization_id, input.provider === 'vapi' ? 'vapi' : 'hubspot_ai');
    const token = input.provider === 'vapi' ? integration?.credentials?.private_api_key : integration?.credentials?.access_token;
    if (!token) return res.status(409).json({ error: `${input.provider}_not_configured` });
    const url = input.provider === 'vapi' ? `https://api.vapi.ai/assistant/${encodeURIComponent(integration.credentials.assistant_id)}` : 'https://api.hubapi.com/crm/v3/properties/contacts/vs_status';
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    res.status(response.ok ? 200 : 502).json({ connected: response.ok, status: response.status });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'invalid_test_request' });
    res.status(500).json({ error: 'connection_test_failed' });
  }
});

router.post('/leads/qualify', requirePlatformAdmin, async (req, res) => {
  try {
    const input = qualifySchema.parse(req.body);
    const qualified = await qualifyCall(input.call_id);
    res.json(qualified);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'invalid_request', issues: error.issues });
    res.status(error.message === 'call_not_found' ? 404 : 500).json({ error: error.message === 'call_not_found' ? error.message : dbError(error) });
  }
});

router.post('/leads/route', requirePlatformAdmin, async (req, res) => {
  try {
    const input = routeSchema.parse(req.body);
    res.json(await routeLead(input.lead_id, input.qualification_result_id));
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'invalid_request', issues: error.issues });
    const known = ['lead_not_found', 'lead_does_not_require_escalation'];
    res.status(error.message === 'lead_not_found' ? 404 : error.message === 'lead_does_not_require_escalation' ? 409 : 500)
      .json({ error: known.includes(error.message) ? error.message : dbError(error) });
  }
});

router.get('/dashboard/calls', requirePlatformAdmin, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { data, error } = await supabaseAdmin.from('ai_calls')
      .select('id, status, started_at, duration_seconds, outcome, ai_handled, created_at, leads(id, first_name, last_name, phone, status), ai_campaigns(id, name, client_name), qualification_results(score, qualified, reasoning, next_action)')
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    const calls = data || [];
    const today = calls.filter((call: any) => new Date(call.created_at) >= since);
    const results = today.map((call: any) => Array.isArray(call.qualification_results) ? call.qualification_results[0] : call.qualification_results).filter(Boolean);
    const qualifiedCount = results.filter((result: any) => result.qualified).length;
    const escalated = results.filter((result: any) => result.next_action === 'escalate_to_human').length;
    const campaignMap = new Map<string, any>();
    for (const call of today as any[]) {
      const campaign = Array.isArray(call.ai_campaigns) ? call.ai_campaigns[0] : call.ai_campaigns;
      const key = campaign?.id || 'unknown';
      const row = campaignMap.get(key) || { campaign_id: key, name: campaign?.name || 'Unknown', client: campaign?.client_name || '', calls: 0, qualified: 0 };
      row.calls += 1;
      const result = Array.isArray(call.qualification_results) ? call.qualification_results[0] : call.qualification_results;
      if (result?.qualified) row.qualified += 1;
      campaignMap.set(key, row);
    }
    res.json({
      metrics: {
        calls_today: today.length,
        qualification_rate: results.length ? Math.round((qualifiedCount / results.length) * 1000) / 10 : 0,
        ai_resolved: Math.max(0, results.length - escalated),
        human_escalated: escalated,
      },
      campaigns: Array.from(campaignMap.values()).map((row) => ({ ...row, qualification_rate: row.calls ? Math.round((row.qualified / row.calls) * 1000) / 10 : 0 })),
      calls,
    });
  } catch (error: any) {
    res.status(500).json({ error: dbError(error) });
  }
});

export default router;
