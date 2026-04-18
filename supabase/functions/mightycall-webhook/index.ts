import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonRecord = Record<string, any>;

function normalizeDigits(value: any): string {
  return String(value ?? "").replace(/\D+/g, "");
}

function firstNonEmpty(...values: any[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function asIso(value: any): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function asSeconds(value: any): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.max(0, Math.round(numeric));
  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.round((Date.now() - parsed) / 1000));
  }
  return null;
}

function extractCallCandidates(payload: any): JsonRecord[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter(Boolean);

  const containers = [
    payload?.calls,
    payload?.callLogs,
    payload?.records,
    payload?.items,
    payload?.events,
    payload?.data,
    payload?.payload,
    payload?.requests,
  ];

  for (const container of containers) {
    if (Array.isArray(container)) return container.filter(Boolean);
    if (Array.isArray(container?.items)) return container.items.filter(Boolean);
    if (Array.isArray(container?.data)) return container.data.filter(Boolean);
  }

  return [payload];
}

function normalizeStatus(raw: any): string {
  const status = String(
    raw?.status ??
      raw?.state ??
      raw?.callStatus ??
      raw?.eventType ??
      raw?.event_name ??
      raw?.type ??
      "",
  )
    .trim()
    .toLowerCase();

  if (!status) return "ringing";
  if (status.includes("answer") || status.includes("connect")) return "answered";
  if (status.includes("ring")) return "ringing";
  if (status.includes("progress") || status.includes("dial")) return "in_progress";
  if (status.includes("miss")) return "missed";
  if (status.includes("fail")) return "failed";
  if (status.includes("cancel")) return "cancelled";
  if (status.includes("voicemail")) return "voicemail";
  if (status.includes("end") || status.includes("complete") || status.includes("finish") || status.includes("hang")) return "completed";
  return status;
}

function normalizeDirection(raw: any): string | null {
  const direction = String(
    raw?.direction ??
      raw?.callDirection ??
      raw?.call_direction ??
      raw?.metadata?.direction ??
      "",
  )
    .trim()
    .toLowerCase();

  if (!direction) return null;
  if (direction.includes("out")) return "outbound";
  if (direction.includes("in")) return "inbound";
  return direction;
}

function extractAgentExtension(raw: any): string | null {
  return firstNonEmpty(
    raw?.agent_extension,
    raw?.agentExtension,
    raw?.agent?.extension,
    raw?.user?.extension,
    raw?.member?.extension,
    raw?.operator?.extension,
    raw?.users?.[0]?.extension,
    raw?.participants?.find?.((participant: any) => participant?.extension)?.extension,
    raw?.metadata?.agent_extension,
    raw?.metadata?.agent?.extension,
  );
}

function extractFromNumber(raw: any): string | null {
  return firstNonEmpty(
    raw?.from_number,
    raw?.fromNumber,
    raw?.callerNumber,
    raw?.caller_number,
    raw?.caller?.number,
    raw?.customer?.number,
    raw?.source?.number,
    raw?.from?.number,
    raw?.phone,
    raw?.number,
    raw?.contact?.phone,
    raw?.metadata?.from_number,
  );
}

function extractToNumber(raw: any): string | null {
  return firstNonEmpty(
    raw?.to_number,
    raw?.toNumber,
    raw?.calleeNumber,
    raw?.callee_number,
    raw?.destination?.number,
    raw?.to?.number,
    raw?.line?.number,
    raw?.did,
    raw?.dnis,
    raw?.calledNumber,
    raw?.called_number,
    raw?.metadata?.to_number,
  );
}

function extractExternalId(raw: any, fromNumber: string | null, toNumber: string | null, startedAt: string | null): string {
  return (
    firstNonEmpty(
      raw?.external_id,
      raw?.externalId,
      raw?.call_id,
      raw?.callId,
      raw?.id,
      raw?.requestGuid,
      raw?.request_guid,
      raw?.guid,
      raw?.uuid,
      raw?.sessionId,
      raw?.session_id,
      raw?.metadata?.external_id,
      raw?.metadata?.call_id,
    ) ||
    [normalizeDigits(fromNumber), normalizeDigits(toNumber), startedAt || new Date().toISOString()].join(":")
  );
}

function normalizeCallRecord(raw: JsonRecord) {
  const fromNumber = extractFromNumber(raw);
  const toNumber = extractToNumber(raw);
  const startedAt = asIso(
    raw?.started_at ??
      raw?.startedAt ??
      raw?.start_time ??
      raw?.startTime ??
      raw?.created_at ??
      raw?.createdAt ??
      raw?.created ??
      raw?.timestamp,
  );
  const answeredAt = asIso(raw?.answered_at ?? raw?.answeredAt ?? raw?.connectTime ?? raw?.connectedAt);
  const endedAt = asIso(raw?.ended_at ?? raw?.endedAt ?? raw?.end_time ?? raw?.endTime ?? raw?.finished_at ?? raw?.finishedAt);
  const direction = normalizeDirection(raw);
  const status = normalizeStatus(raw);
  const externalId = extractExternalId(raw, fromNumber, toNumber, startedAt);
  const durationSeconds =
    asSeconds(raw?.duration_seconds ?? raw?.durationSeconds ?? raw?.duration) ??
    (startedAt && endedAt ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000)) : null);

  return {
    external_id: externalId,
    from_number: fromNumber,
    to_number: toNumber,
    from_digits: normalizeDigits(fromNumber),
    to_digits: normalizeDigits(toNumber),
    started_at: startedAt,
    answered_at: answeredAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    status,
    direction,
    queue_name: firstNonEmpty(raw?.queue_name, raw?.queueName, raw?.queue?.name, raw?.metadata?.queue_name),
    agent_extension: extractAgentExtension(raw),
    payload: raw,
  };
}

async function resolveOrgIdForCall(supabase: ReturnType<typeof createClient>, call: ReturnType<typeof normalizeCallRecord>): Promise<string | null> {
  const explicitOrgId = firstNonEmpty(
    call.payload?.org_id,
    call.payload?.orgId,
    call.payload?.organization_id,
    call.payload?.organizationId,
    call.payload?.metadata?.org_id,
    call.payload?.metadata?.orgId,
    call.payload?.metadata?.organization_id,
    call.payload?.metadata?.organizationId,
  );
  if (explicitOrgId) return explicitOrgId;

  const digitsToMatch = [call.to_digits, call.from_digits].filter(Boolean);
  if (digitsToMatch.length === 0) return null;

  const { data, error } = await supabase
    .from("phone_numbers")
    .select("*")
    .limit(5000);

  if (error) {
    console.error("[mightycall-webhook] phone lookup failed", error);
    return null;
  }

  for (const row of data || []) {
    const phoneDigits = normalizeDigits(row?.number ?? row?.phone_number ?? row?.e164 ?? row?.metadata?.number);
    if (!phoneDigits) continue;
    if (digitsToMatch.includes(phoneDigits) && row?.org_id) {
      return String(row.org_id);
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "ok", message: "MightyCall webhook is ready" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const candidates = extractCallCandidates(payload);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let processed = 0;
    const results: Array<{ external_id: string; org_id: string | null; status: string; action: string }> = [];

    for (const rawCall of candidates) {
      const call = normalizeCallRecord(rawCall);
      if (!call.external_id) continue;
      if (!call.from_number && !call.to_number) continue;

      const orgId = await resolveOrgIdForCall(supabase, call);
      const row = {
        org_id: orgId,
        external_id: call.external_id,
        from_number: call.from_number,
        to_number: call.to_number,
        started_at: call.started_at,
        answered_at: call.answered_at,
        ended_at: call.ended_at,
        duration_seconds: call.duration_seconds,
        status: call.status,
        direction: call.direction,
        queue_name: call.queue_name,
        agent_extension: call.agent_extension,
        metadata: {
          source: "mightycall_webhook",
          raw: call.payload,
        },
      };

      let upserted = false;
      if (orgId) {
        const { error } = await supabase
          .from("calls")
          .upsert(row, { onConflict: "org_id,external_id" });
        if (!error) {
          upserted = true;
        } else {
          console.error("[mightycall-webhook] org scoped upsert failed", error);
        }
      }

      if (!upserted) {
        const { error } = await supabase
          .from("calls")
          .upsert(row, { onConflict: "external_id" });
        if (error) {
          console.error("[mightycall-webhook] fallback upsert failed", error);
          continue;
        }
      }

      processed += 1;
      results.push({
        external_id: call.external_id,
        org_id: orgId,
        status: call.status,
        action: "upserted",
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        received: candidates.length,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[mightycall-webhook] fatal error", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
