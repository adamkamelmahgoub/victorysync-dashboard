// Supabase Edge Function: MightyCall Recordings Webhook
// Endpoint: https://[project].supabase.co/functions/v1/mightycall-recordings-webhook
//
// Receives recording metadata from MightyCall and stores it in the database
// Called by MightyCall webhook when recordings are available

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("MIGHTYCALL_WEBHOOK_SECRET") || "your-secret-key";

const supabase = createClient(supabaseUrl, supabaseKey);

interface MightyCallRecordingWebhook {
  event: string;
  recording_id: string;
  call_id: string;
  phone_number: string;
  url: string;
  duration: number;
  format: string; // "mp3", "wav", etc.
  size_bytes?: number;
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
    const payload: MightyCallRecordingWebhook = await req.json();

    // Validate required fields
    if (!payload.recording_id || !payload.url || !payload.duration) {
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
      console.warn("No organization ID found for recording:", payload.recording_id);
      return new Response(
        JSON.stringify({ error: "No organization context" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Find the call record
    let callId: string | undefined;
    if (payload.call_id) {
      const { data: call } = await supabase
        .from("calls")
        .select("id")
        .eq("org_id", orgId)
        .eq("external_call_id", payload.call_id)
        .single();
      
      callId = call?.id;
    }

    // Find phone number in database
    const { data: phone } = await supabase
      .from("phone_numbers")
      .select("id")
      .eq("org_id", orgId)
      .eq("number", payload.phone_number)
      .single();

    const phoneId = phone?.id;

    // Store recording metadata
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
      return new Response(
        JSON.stringify({
          error: "Failed to store recording",
          details: recordingError,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log("Recording stored successfully:", payload.recording_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Recording recorded",
        recording_id: payload.recording_id,
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
