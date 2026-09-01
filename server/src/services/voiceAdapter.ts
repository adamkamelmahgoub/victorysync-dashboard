import crypto from 'crypto';
import fetch from 'node-fetch';

export type InitiateVoiceCallInput = {
  callId: string;
  to: string;
  lead: Record<string, unknown>;
  campaign: Record<string, unknown>;
};

export type VoiceCallEvent = {
  vendorCallId: string;
  status: string;
  transcript?: string;
  outcome?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  raw: Record<string, unknown>;
};

export interface VoiceAdapter {
  readonly name: string;
  initiate(input: InitiateVoiceCallInput): Promise<{ vendorCallId: string; status: string }>;
  verifyWebhook(rawBody: string, signature?: string): boolean;
  parseWebhook(payload: Record<string, any>): VoiceCallEvent;
}

class ConfigurableHttpVoiceAdapter implements VoiceAdapter {
  readonly name = process.env.VOICE_AI_VENDOR || 'unconfigured';

  async initiate(input: InitiateVoiceCallInput) {
    const endpoint = process.env.VOICE_AI_INITIATE_URL;
    const apiKey = process.env.VOICE_AI_API_KEY;
    if (!endpoint || !apiKey) throw new Error('voice_vendor_not_configured');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`voice_vendor_error:${response.status}`);
    const vendorCallId = String(body.id || body.call_id || body.callId || '');
    if (!vendorCallId) throw new Error('voice_vendor_missing_call_id');
    return { vendorCallId, status: String(body.status || 'initiated') };
  }

  verifyWebhook(rawBody: string, signature?: string) {
    const secret = process.env.VOICE_AI_WEBHOOK_SECRET;
    if (!secret || !signature) return process.env.NODE_ENV !== 'production';
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const received = signature.replace(/^sha256=/i, '');
    if (expected.length !== received.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  }

  parseWebhook(payload: Record<string, any>): VoiceCallEvent {
    const call = payload.call || payload.data || payload;
    return {
      vendorCallId: String(call.id || call.call_id || call.callId || ''),
      status: String(call.status || payload.event || 'completed'),
      transcript: call.transcript == null ? undefined : String(call.transcript),
      outcome: call.outcome == null ? undefined : String(call.outcome),
      startedAt: call.started_at || call.startedAt,
      endedAt: call.ended_at || call.endedAt,
      durationSeconds: Number.isFinite(Number(call.duration_seconds ?? call.duration))
        ? Math.max(0, Math.round(Number(call.duration_seconds ?? call.duration)))
        : undefined,
      raw: payload,
    };
  }
}

export function getVoiceAdapter(): VoiceAdapter {
  return new ConfigurableHttpVoiceAdapter();
}
