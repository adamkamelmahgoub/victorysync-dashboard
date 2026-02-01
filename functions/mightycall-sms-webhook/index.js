// Supabase Edge Function: MightyCall SMS Webhook
// Endpoint: https://[project].supabase.co/functions/v1/mightycall-sms-webhook
//
// Receives SMS messages from MightyCall and stores them in the database
// Called by MightyCall webhook when SMS are sent/received

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("MIGHTYCALL_WEBHOOK_SECRET") || "your-secret-key";

const supabase = createClient(supabaseUrl, supabaseKey);

interface MightyCallSMSWebhook {
  event: string;
  sms_id: string;
  phone_number: string;
  direction: "inbound" | "outbound";
  sender: string;
  recipient: string;
  message: string;
  status: "sent" | "received" | "failed" | "pending";
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
    const payload: MightyCallSMSWebhook = await req.json();

    // Validate required fields
    if (!payload.sms_id || !payload.phone_number || !payload.message) {
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
      console.warn("No organization ID found for SMS:", payload.sms_id);
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

    // Store SMS message
    const { error: smsError } = await supabase
      .from("mightycall_sms_messages")
      .insert({
        org_id: orgId,
        phone_id: phoneId,
        external_sms_id: payload.sms_id,
        direction: payload.direction,
        sender: payload.sender,
        recipient: payload.recipient,
        message: payload.message,
        status: payload.status,
        message_date: new Date(payload.timestamp).toISOString(),
        created_at: new Date().toISOString(),
      });

    if (smsError) {
      console.error("Error storing SMS:", smsError);
      return new Response(
        JSON.stringify({ error: "Failed to store SMS", details: smsError }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log("SMS stored successfully:", payload.sms_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "SMS recorded",
        sms_id: payload.sms_id,
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
