// Supabase Edge Function: MightyCall Reports/Metrics Webhook
// Endpoint: https://[project].supabase.co/functions/v1/mightycall-reports-webhook
//
// Receives metrics and reports from MightyCall and stores them in the database
// Called by MightyCall webhook for daily/hourly metrics, call statistics, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("MIGHTYCALL_WEBHOOK_SECRET") || "your-secret-key";

const supabase = createClient(supabaseUrl, supabaseKey);

interface MightyCallMetric {
  metric_type: string; // "calls_total", "calls_completed", "calls_missed", "sms_sent", "sms_received", "avg_call_duration", "queue_wait_time"
  value: number;
  unit?: string; // "seconds", "minutes", "count", etc.
}

interface MightyCallReportWebhook {
  event: string;
  report_id: string;
  report_type: string; // "daily", "hourly", "summary", "queue_stats"
  date: string; // ISO 8601 date
  hour?: number; // For hourly reports
  phone_number?: string;
  metrics: MightyCallMetric[];
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
    const payload: MightyCallReportWebhook = await req.json();

    // Validate required fields
    if (!payload.report_id || !payload.metrics || payload.metrics.length === 0) {
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
      console.warn("No organization ID found for report:", payload.report_id);
      return new Response(
        JSON.stringify({ error: "No organization context" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Store each metric as a report record
    const reportDate = new Date(payload.date);
    const insertPromises = payload.metrics.map(metric =>
      supabase
        .from("mightycall_reports")
        .insert({
          org_id: orgId,
          external_report_id: payload.report_id,
          report_type: payload.report_type,
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
      return new Response(
        JSON.stringify({
          error: "Failed to store some reports",
          details: errors.map(e => e.error),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Report stored successfully with ${payload.metrics.length} metrics:`, payload.report_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Report recorded",
        report_id: payload.report_id,
        metrics_stored: payload.metrics.length,
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
