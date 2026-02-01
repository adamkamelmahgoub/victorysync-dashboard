import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from server directory
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
const mightycallBaseUrl = process.env.MIGHTYCALL_BASE_URL || "https://ccapi.mightycall.com/v4";

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

async function syncRealMightyCallRecordings() {
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

    // Extract and insert ONLY recordings (no calls table insert)
    console.log("\nExtracting recordings from calls...");
    const recordings = callsResponse
      .filter((call) => call.callRecord || call.recordingUri)
      .map((call) => ({
        id: randomUUID(), // Generate a proper UUID
        recording_url:
          call.callRecord?.uri ||
          call.recordingUri ||
          call.recordingUrl ||
          null,
        duration_seconds: call.duration || 0,
        recording_date:
          call.startTime ||
          call.createdAt ||
          new Date().toISOString(),
        org_id: orgId,
        created_at: new Date().toISOString(),
      }));

    console.log(`Recordings to insert: ${recordings.length}`);

    if (recordings.length === 0) {
      console.log("No recordings found with callRecord data");
      process.exit(0);
    }

    // Try inserting without call_id to bypass FK check
    console.log("\nTrying insert WITHOUT call_id (to bypass FK)...");
    const recordingsNoFK = recordings.map((rec) => {
      const copy = { ...rec };
      delete copy.call_id;
      return copy;
    });

    const { error: recError } = await supabase
      .from("mightycall_recordings")
      .upsert(recordingsNoFK, { onConflict: "id" });

    if (recError) {
      console.error("Failed to insert recordings:", recError.message);
      console.error("Details:", recError);
      process.exit(1);
    } else {
      console.log(`Inserted/upserted ${recordings.length} recordings`);
    }

    console.log("\n✅ Sync completed!");
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

syncRealMightyCallRecordings();
