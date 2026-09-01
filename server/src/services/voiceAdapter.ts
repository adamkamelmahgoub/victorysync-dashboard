import fetch from 'node-fetch';
import { getOrgIntegration } from '../lib/integrationsStore';

export type InitiateVoiceCallInput = { callId: string; to: string; lead: Record<string, any>; campaign: Record<string, any> };
export type VoiceCallEvent = { vendorCallId: string; status: string; transcript?: string; outcome?: string; startedAt?: string; endedAt?: string; durationSeconds?: number; raw: Record<string, unknown> };
export interface VoiceAdapter {
  readonly name: string;
  initiate(input: InitiateVoiceCallInput): Promise<{ vendorCallId: string; status: string }>;
  verifyWebhook(): boolean;
  parseWebhook(payload: Record<string, any>): VoiceCallEvent;
}

type VapiCredentials = { private_api_key: string; assistant_id: string; phone_number_id: string; webhook_secret: string };

class VapiVoiceAdapter implements VoiceAdapter {
  readonly name = 'vapi';
  constructor(private readonly credentials: VapiCredentials, private readonly receivedSecret?: string) {}

  async initiate(input: InitiateVoiceCallInput) {
    const name = [input.lead.first_name, input.lead.last_name].filter(Boolean).join(' ');
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.credentials.private_api_key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        assistantId: this.credentials.assistant_id,
        phoneNumberId: this.credentials.phone_number_id,
        customer: { number: input.to, name: name || undefined },
        assistantOverrides: { variableValues: {
          victorysyncCallId: input.callId, leadId: input.lead.id,
          firstName: input.lead.first_name || '', lastName: input.lead.last_name || '',
          campaignName: input.campaign.name || '',
        } },
      }),
    });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`vapi_http_${response.status}`);
    if (!body.id) throw new Error('vapi_missing_call_id');
    return { vendorCallId: String(body.id), status: String(body.status || 'queued') };
  }

  verifyWebhook() {
    return Boolean(this.credentials.webhook_secret) && this.receivedSecret === this.credentials.webhook_secret;
  }

  parseWebhook(payload: Record<string, any>): VoiceCallEvent {
    const message = payload.message || payload;
    const call = message.call || {};
    const artifact = message.artifact || call.artifact || {};
    const started = call.startedAt || call.started_at;
    const ended = call.endedAt || call.ended_at;
    const duration = started && ended ? Math.max(0, Math.round((Date.parse(ended) - Date.parse(started)) / 1000)) : undefined;
    return {
      vendorCallId: String(call.id || message.callId || ''),
      status: message.type === 'end-of-call-report' ? 'ended' : String(call.status || message.status || message.type || 'unknown'),
      transcript: artifact.transcript || call.transcript,
      outcome: message.endedReason || call.endedReason || call.analysis?.summary,
      startedAt: started, endedAt: ended, durationSeconds: duration, raw: payload,
    };
  }
}

export async function getVoiceAdapter(orgId: string, receivedSecret?: string): Promise<VoiceAdapter> {
  const integration = await getOrgIntegration(orgId, 'vapi');
  const credentials = integration?.credentials as VapiCredentials | null;
  if (!credentials?.private_api_key || !credentials.assistant_id || !credentials.phone_number_id) throw new Error('vapi_not_configured');
  return new VapiVoiceAdapter(credentials, receivedSecret);
}
