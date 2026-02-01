import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from server directory (one level up from scripts)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", "server", ".env");
dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;
const mightycallApiKey = process.env.MIGHTYCALL_API_KEY;
const mightycallUserKey = process.env.MIGHTYCALL_USER_KEY;
const mightycallBaseUrl =
  process.env.MIGHTYCALL_BASE_URL || "https://ccapi.mightycall.com/v4";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

if (!mightycallApiKey || !mightycallUserKey) {
  console.error("Missing MightyCall credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getMightyCallToken() {
  try {
    const url = `${mightycallBaseUrl}/auth/token`;
    const body = new URLSearchParams();
    body.append("grant_type", "client_credentials");
    body.append("client_id", mightycallApiKey);
    body.append("client_secret", mightycallUserKey);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Auth failed: ${response.status} - ${text}`);
    }

    const data = await response.json();
    return data.access_token || data.token;
  } catch (error) {
    console.error(
      "MightyCall auth failed:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function getMightyCallCalls(token, pageSize = 100) {
  try {
    const startUtc = "2026-01-01";
    const endUtc = "2026-02-01";

    // Try multiple endpoint variations
    const endpoints = [
      `${mightycallBaseUrl}/api/calls`,
      `${mightycallBaseUrl}/calls`,
      `${mightycallBaseUrl.replace("/v4", "")}/v4/api/calls`,
    ];

    for (const baseUrl of endpoints) {
      try {
        const url = `${baseUrl}?startUtc=${startUtc}&endUtc=${endUtc}&pageSize=${pageSize}`;
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          console.log(`[DEBUG] Calls endpoint succeeded: ${baseUrl}`);
          return response.json();
        }
      } catch (e) {
        // Try next endpoint
      }
    }

    throw new Error(`All calls endpoints failed`);
  } catch (error) {
    console.error(
      "Failed to fetch calls:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function syncRealMightyCallData() {
  try {
    console.log("Fetching MightyCall token...");
    const token = await getMightyCallToken();
    console.log("Token obtained:", token.length, "chars");

    console.log("\nFetching MightyCall calls...");
    let callsResponse = await getMightyCallCalls(token, 100);
    
    // Handle wrapped response
    if (callsResponse && typeof callsResponse === "object" && !Array.isArray(callsResponse)) {
      callsResponse = callsResponse.data?.calls || callsResponse.calls || callsResponse.data || [];
    }
    
    console.log(`Fetched ${callsResponse.length} calls`);

    if (callsResponse.length === 0) {
      console.log("No calls found in the date range");
      process.exit(0);
    }

    // Get the default org_id (first org)
    const { data: orgs, error: orgError } = await supabase
      .from("organizations")
      .select("id")
      .limit(1);

    if (orgError || !orgs || orgs.length === 0) {
      console.error("No organizations found. Please create an org first.");
      process.exit(1);
    }

    const orgId = orgs[0].id;
    console.log(`Using org_id: ${orgId}`);

    // Step 1: Insert stub call records to satisfy FK constraint
    // Use the actual columns that exist in the calls table
    console.log("\nInserting call records...");
    const callsToInsert = callsResponse.map((call) => ({
      id: call.id, // Use MightyCall call ID
      org_id: orgId,
      from_number: call.from || call.fromNumber || call.caller || call.callerPhone || "Unknown",
      to_number: call.to || call.toNumber || call.businessNumber || call.businessPhone || "Unknown",
      started_at: call.startTime || call.createdAt || new Date().toISOString(),
      ended_at: call.endTime || call.finishTime || null,
      duration_seconds: call.duration || 0,
      duration_sec: call.duration || 0,
      status: call.status || call.callStatus || "Unknown",
      created_at: new Date().toISOString(),
      date: new Date().toISOString().split("T")[0],
      provider: "mightycall",
      recording_url: call.callRecord?.uri || call.recordingUri || null,
      result: null,
      satisfaction_score: null,
      revenue_generated: null,
      is_missed: call.callStatus === "Missed" || false,
      first_call_resolution: null,
      metadata: call,
    }));

    const { error: callsError } = await supabase
      .from("calls")
      .upsert(callsToInsert, { onConflict: "id" });

    if (callsError) {
      console.error("Failed to insert calls:", callsError.message);
      console.error("Details:", callsError);
      process.exit(1);
    }

    console.log(`Inserted/upserted ${callsToInsert.length} call records`);

    // Step 2: Extract and insert recordings
    console.log("\nExtracting recordings from calls...");
    const recordings = callsResponse
      .filter((call) => call.callRecord || call.recordingUri)
      .map((call) => ({
        id: `rec-${call.id}`,
        call_id: call.id, // Now this FK reference will exist
        recording_url:
          call.callRecord?.uri ||
          call.recordingUri ||
          call.recordingUrl ||
          null,
        duration_seconds: call.duration || 0,
        call_date:
          call.startTime || call.createdAt || new Date().toISOString(),
        org_id: orgId,
        created_at: new Date().toISOString(),
      }));

    console.log(`Recordings to insert: ${recordings.length}`);

    if (recordings.length > 0) {
      const { error: recError, count: recsInserted } = await supabase
        .from("mightycall_recordings")
        .upsert(recordings, { onConflict: "id" });

      if (recError) {
        console.error("Failed to insert recordings:", recError.message);
        console.error("Details:", recError);
        process.exit(1);
      }

      console.log(
        `Inserted/upserted ${recsInserted || recordings.length} recordings`
      );
    }

    console.log("\n✅ Sync completed successfully!");
    console.log(`- Calls: ${callsToInsert.length}`);
    console.log(`- Recordings: ${recordings.length}`);
    process.exit(0);
  } catch (error) {
    console.error(
      "Sync failed:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

syncRealMightyCallData();
