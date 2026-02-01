// Supabase Edge Function: MightyCall Calls Webhook
// Endpoint: https://[project].supabase.co/functions/v1/mightycall-calls-webhook
// 
// Receives call records from MightyCall and stores them in the database
// Called by MightyCall webhook when calls are completed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("MIGHTYCALL_WEBHOOK_SECRET") || "your-secret-key";

const supabase = createClient(supabaseUrl, supabaseKey);

interface MightyCallWebhookRequest {
  event: string;
  call_id: string;
  phone_number: string;
  caller_name?: string;
  caller_phone?: string;
  duration: number;
  status: "completed" | "missed" | "voicemail" | "transferred";
  direction: "inbound" | "outbound";
  recording_url?: string;
  timestamp: string;
  integration_id?: string;
  org_id?: string;
}

serve(async (req) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Verify webhook secret
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = authHeader.substring(7);
    if (token !== webhookSecret) {
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const payload: MightyCallWebhookRequest = await req.json();

    // Validate required fields
    if (!payload.call_id || !payload.phone_number || !payload.duration) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // If org_id not provided, try to find it from integration
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

    if (!orgId) {
      console.warn("No organization ID found for call:", payload.call_id);
      return new Response(
        JSON.stringify({ error: "No organization context" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Find phone number in database
    const { data: phone } = await supabase
      .from("phone_numbers")
      .select("id")
      .eq("org_id", orgId)
      .eq("number", payload.phone_number)
      .single();

    const phoneId = phone?.id;

    // Store call record
    const { data: callRecord, error: callError } = await supabase
      .from("calls")
      .insert({
        org_id: orgId,
        phone_id: phoneId,
        external_call_id: payload.call_id,
        caller_name: payload.caller_name || "Unknown",
        caller_phone: payload.caller_phone,
        duration_seconds: payload.duration,
        status: payload.status,
        direction: payload.direction,
        call_date: new Date(payload.timestamp).toISOString(),
        created_at: new Date().toISOString(),
      });

    if (callError) {
      console.error("Error storing call:", callError);
      return new Response(
        JSON.stringify({ error: "Failed to store call", details: callError }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
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

    return new Response(
      JSON.stringify({
        success: true,
        message: "Call recorded",
        call_id: payload.call_id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
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
