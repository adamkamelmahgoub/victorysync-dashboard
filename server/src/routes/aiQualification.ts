import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { isPlatformAdmin } from '../auth/rbac';
import { supabaseAdmin } from '../lib/supabaseClient';
import { getVoiceAdapter } from '../services/voiceAdapter';
import { scoreQualification } from '../services/qualificationEngine';
import { syncLeadToHubSpot } from '../services/hubspotSync';

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
    .select('id, lead_id, transcript, outcome, campaign_id, ai_campaigns(qualification_config)')
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
    .select('id, hubspot_contact_id, ai_resolution')
    .eq('id', leadId)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead) throw new Error('lead_not_found');
  if (lead.ai_resolution !== 'escalate_to_human') throw new Error('lead_does_not_require_escalation');

  const { count } = await supabaseAdmin.from('lead_routing_events').select('id', { count: 'exact', head: true });
  const agents = [
    { name: 'Rall', id: process.env.ROUTING_AGENT_RALL_ID || null },
    { name: 'Shehab', id: process.env.ROUTING_AGENT_SHEHAB_ID || null },
  ];
  const agent = agents[(count || 0) % agents.length];
  const now = new Date().toISOString();
  const hubspot = await syncLeadToHubSpot(lead.hubspot_contact_id, {
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
    const adapter = getVoiceAdapter();
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
    const code = String(error?.message || '').startsWith('voice_') ? String(error.message) : dbError(error);
    res.status(code === 'voice_vendor_not_configured' ? 503 : 500).json({ error: code });
  }
});

router.post('/calls/webhook', async (req, res) => {
  try {
    const adapter = getVoiceAdapter();
    const signature = String(req.header('x-voice-signature') || '');
    const canonicalBody = JSON.stringify(req.body || {});
    if (!adapter.verifyWebhook(canonicalBody, signature)) return res.status(401).json({ error: 'invalid_webhook_signature' });
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
