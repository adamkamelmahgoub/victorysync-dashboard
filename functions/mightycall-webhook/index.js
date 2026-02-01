// Supabase Edge Function: Unified MightyCall Webhook
// Endpoint: https://[project].supabase.co/functions/v1/mightycall-webhook
//
// Single webhook that handles all MightyCall events:
// - Calls (call.completed, call.started, call.missed)
// - SMS (sms.sent, sms.received)
// - Recordings (recording.available)
// - Reports (report.daily, report.hourly, report.summary)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("MIGHTYCALL_WEBHOOK_SECRET") || "your-secret-key";

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper: Get organization ID from payload or integration lookup
async function getOrgId(payload) {
  let orgId = payload.org_id;
  
  if (!orgId && payload.integration_id) {
    const { data: integration } = await supabase
      .from("org_integrations")
      .select("org_id")
      .eq("id", payload.integration_id)
      .single();
    
    if (integration) {
      orgId = integration.org_id;
    }
  }
  
  return orgId;
}

// Helper: Get phone ID from organization and phone number
async function getPhoneId(orgId, phoneNumber) {
  if (!phoneNumber) return null;
  
  const { data: phone } = await supabase
    .from("phone_numbers")
    .select("id")
    .eq("org_id", orgId)
    .eq("number", phoneNumber)
    .single();
  
  return phone?.id;
}

// Handler: Call events
async function handleCallEvent(payload, orgId) {
  // Validate required fields
  if (!payload.call_id || !payload.phone_number || payload.duration === undefined) {
    return {
      error: "Missing required fields for call event",
      statusCode: 400
    };
  }

  const phoneId = await getPhoneId(orgId, payload.phone_number);

  const { data: callRecord, error: callError } = await supabase
    .from("calls")
    .insert({
      org_id: orgId,
      phone_id: phoneId,
      external_call_id: payload.call_id,
      caller_name: payload.caller_name || "Unknown",
      caller_phone: payload.caller_phone,
      duration_seconds: payload.duration,
      status: payload.status || "completed",
      direction: payload.direction || "inbound",
      call_date: new Date(payload.timestamp).toISOString(),
      created_at: new Date().toISOString(),
    });

  if (callError) {
    console.error("Error storing call:", callError);
    return {
      error: "Failed to store call",
      details: callError,
      statusCode: 500
    };
  }

  // If recording URL provided, store recording metadata
  if (payload.recording_url && callRecord) {
    await supabase
      .from("mightycall_recordings")
      .insert({
        org_id: orgId,
        call_id: callRecord[0]?.id,
        external_call_id: payload.call_id,
        url: payload.recording_url,
        duration_seconds: payload.duration,
        created_at: new Date().toISOString(),
      });
  }

  console.log("Call stored successfully:", payload.call_id);

  return {
    success: true,
    message: "Call recorded",
    call_id: payload.call_id,
    statusCode: 200
  };
}

// Handler: SMS events
async function handleSmsEvent(payload, orgId) {
  // Validate required fields
  if (!payload.sms_id || !payload.phone_number || !payload.message) {
    return {
      error: "Missing required fields for SMS event",
      statusCode: 400
    };
  }

  const phoneId = await getPhoneId(orgId, payload.phone_number);

  const { error: smsError } = await supabase
    .from("mightycall_sms_messages")
    .insert({
      org_id: orgId,
      phone_id: phoneId,
      external_sms_id: payload.sms_id,
      direction: payload.direction || "inbound",
      sender: payload.sender,
      recipient: payload.recipient,
      message: payload.message,
      status: payload.status || "received",
      message_date: new Date(payload.timestamp).toISOString(),
      created_at: new Date().toISOString(),
    });

  if (smsError) {
    console.error("Error storing SMS:", smsError);
    return {
      error: "Failed to store SMS",
      details: smsError,
      statusCode: 500
    };
  }

  console.log("SMS stored successfully:", payload.sms_id);

  return {
    success: true,
    message: "SMS recorded",
    sms_id: payload.sms_id,
    statusCode: 200
  };
}

// Handler: Recording events
async function handleRecordingEvent(payload, orgId) {
  // Validate required fields
  if (!payload.recording_id || !payload.url || payload.duration === undefined) {
    return {
      error: "Missing required fields for recording event",
      statusCode: 400
    };
  }

  // Find the call record if call_id provided
  let callId;
  if (payload.call_id) {
    const { data: call } = await supabase
      .from("calls")
      .select("id")
      .eq("org_id", orgId)
      .eq("external_call_id", payload.call_id)
      .single();
    
    callId = call?.id;
  }

  // Find phone number if provided
  const phoneId = payload.phone_number ? await getPhoneId(orgId, payload.phone_number) : null;

  const { error: recordingError } = await supabase
    .from("mightycall_recordings")
    .insert({
      org_id: orgId,
      call_id: callId,
      phone_id: phoneId,
      external_recording_id: payload.recording_id,
      external_call_id: payload.call_id,
      url: payload.url,
      duration_seconds: payload.duration,
      format: payload.format || "mp3",
      size_bytes: payload.size_bytes,
      created_at: new Date().toISOString(),
    });

  if (recordingError) {
    console.error("Error storing recording:", recordingError);
    return {
      error: "Failed to store recording",
      details: recordingError,
      statusCode: 500
    };
  }

  console.log("Recording stored successfully:", payload.recording_id);

  return {
    success: true,
    message: "Recording recorded",
    recording_id: payload.recording_id,
    statusCode: 200
  };
}

// Handler: Report/Metrics events
async function handleReportEvent(payload, orgId) {
  // Validate required fields
  if (!payload.report_id || !payload.metrics || payload.metrics.length === 0) {
    return {
      error: "Missing required fields for report event",
      statusCode: 400
    };
  }

  // Store each metric as a report record
  const reportDate = new Date(payload.date || payload.timestamp);
  const insertPromises = payload.metrics.map(metric =>
    supabase
      .from("mightycall_reports")
      .insert({
        org_id: orgId,
        external_report_id: payload.report_id,
        report_type: payload.report_type || "summary",
        metric_type: metric.metric_type,
        value: metric.value,
        unit: metric.unit,
        report_date: reportDate.toISOString(),
        created_at: new Date().toISOString(),
      })
  );

  const results = await Promise.all(insertPromises);
  
  // Check for errors
  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.error("Error storing reports:", errors);
    return {
      error: "Failed to store some reports",
      details: errors.map(e => e.error),
      statusCode: 500
    };
  }

  console.log(`Report stored successfully with ${payload.metrics.length} metrics:`, payload.report_id);

  return {
    success: true,
    message: "Report recorded",
    report_id: payload.report_id,
    metrics_stored: payload.metrics.length,
    statusCode: 200
  };
}

// Route event to appropriate handler
async function routeEvent(payload, orgId) {
  const event = payload.event || "";

  // Call events
  if (event.startsWith("call.")) {
    return await handleCallEvent(payload, orgId);
  }

  // SMS events
  if (event.startsWith("sms.")) {
    return await handleSmsEvent(payload, orgId);
  }

  // Recording events
  if (event.startsWith("recording.")) {
    return await handleRecordingEvent(payload, orgId);
  }

  // Report events
  if (event.startsWith("report.")) {
    return await handleReportEvent(payload, orgId);
  }

  return {
    error: `Unknown event type: ${event}`,
    statusCode: 400
  };
}

serve(async (req) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Read raw text and parse JSON
    const rawText = await req.text();
    let payload = null;
    try {
      payload = JSON.parse(rawText);
    } catch (e) {
      console.warn('[Webhook] Failed to parse JSON body, rawText length=', String(rawText || '').length);
    }

    // Validate payload was parsed
    if (!payload || typeof payload !== 'object') {
      console.warn('[Webhook] Invalid or missing payload after parsing');
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify webhook using Authorization bearer token OR HMAC signature header (x-signature)
    const authHeader = req.headers.get("Authorization");
    const sigHeader = req.headers.get("x-signature") || req.headers.get("x-mc-signature") || req.headers.get("x-mightycall-signature");

    let isAuthorized = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      isAuthorized = (token === webhookSecret);
    } else if (sigHeader && rawText) {
      // Verify HMAC SHA-256 of raw body
      try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawText));
        const sigBytes = new Uint8Array(sigBuf);
        const hex = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
        const b64 = btoa(String.fromCharCode(...sigBytes));
        isAuthorized = (sigHeader === hex || sigHeader === b64);
      } catch (sigErr) {
        console.warn('[Webhook] signature verification error', sigErr?.message || sigErr);
        isAuthorized = false;
      }
    }

    if (!isAuthorized) {
      console.warn('[Webhook] Unauthorized: no valid auth header or signature');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get organization ID
    const orgId = await getOrgId(payload);
    if (!orgId) {
      console.warn("No organization ID found for event:", payload?.event || 'unknown');
      return new Response(
        JSON.stringify({ error: "No organization context", event: payload?.event }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Store raw event for auditing (non-fatal if table missing)
    try {
      const eventId = payload?.event_id || payload?.id || `${payload?.event || 'evt'}:${payload?.timestamp || Date.now()}`;
      await supabase
        .from('mightycall_raw_events')
        .insert({ external_event_id: eventId, org_id: orgId, event_type: payload.event, payload: payload, received_at: new Date().toISOString() });
    } catch (storeErr) {
      console.warn('[Webhook] failed to store raw event (continuing):', storeErr?.message || storeErr);
    }

    // Route to appropriate handler
    const result = await routeEvent(payload, orgId);

    // Return response
    const statusCode = result.statusCode || 200;
    const response = {
      success: result.success || false,
      message: result.message || result.error,
      ...(result.success ? { event: payload?.event } : { error: result.error, details: result.details }),
    };

    // Include specific fields
    if (result.call_id) response.call_id = result.call_id;
    if (result.sms_id) response.sms_id = result.sms_id;
    if (result.recording_id) response.recording_id = result.recording_id;
    if (result.report_id) response.report_id = result.report_id;
    if (result.metrics_stored) response.metrics_stored = result.metrics_stored;

    return new Response(JSON.stringify(response), {
      status: statusCode,
      headers: { "Content-Type": "application/json", 'x-processed-at': new Date().toISOString() },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
