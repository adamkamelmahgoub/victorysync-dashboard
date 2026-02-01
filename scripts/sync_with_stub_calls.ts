import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const mightycallApiKey = process.env.MIGHTYCALL_API_KEY;
const mightycallUserKey = process.env.MIGHTYCALL_USER_KEY;
const mightycallBaseUrl =
  process.env.MIGHTYCALL_BASE_URL || "https://ccapi.mightycall.com";

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
    const response = await axios.post(
      `${mightycallBaseUrl}/v4/api/auth`,
      {
        apiKey: mightycallApiKey,
        userKey: mightycallUserKey,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    return response.data.token;
  } catch (error) {
    console.error("MightyCall auth failed:", error.message);
    throw error;
  }
}

async function getMightyCallCalls(token, pageSize = 100) {
  try {
    const startUtc = "2026-01-01";
    const endUtc = "2026-02-01";

    const response = await axios.get(
      `${mightycallBaseUrl}/v4/api/calls?startUtc=${startUtc}&endUtc=${endUtc}&pageSize=${pageSize}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return response.data;
  } catch (error) {
    console.error("Failed to fetch calls:", error.message);
    throw error;
  }
}

async function syncRealMightyCallData() {
  try {
    console.log("Fetching MightyCall token...");
    const token = await getMightyCallToken();
    console.log("Token obtained:", token.length, "chars");

    console.log("\nFetching MightyCall calls...");
    const callsResponse = await getMightyCallCalls(token, 100);
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
    console.log("\nInserting stub call records...");
    const callsToInsert = callsResponse.map((call: any) => ({
      id: call.id, // Use MightyCall call ID
      org_id: orgId,
      from_number: call.from || call.fromNumber || call.caller || "Unknown",
      to_number: call.to || call.toNumber || call.businessNumber || "Unknown",
      started_at: call.startTime || call.createdAt || new Date().toISOString(),
      ended_at: call.endTime || call.finishTime || null,
      duration_seconds: call.duration || 0,
      status: call.status || call.callStatus || "Unknown",
      created_at: new Date().toISOString(),
    }));

    const { error: callsError, count: callsInserted } = await supabase
      .from("calls")
      .upsert(callsToInsert, { onConflict: "id" });

    if (callsError) {
      console.error("Failed to insert calls:", callsError.message);
      console.error("Details:", callsError);
      process.exit(1);
    }

    console.log(`Inserted/upserted ${callsInserted || callsToInsert.length} call records`);

    // Step 2: Extract and insert recordings
    console.log("\nExtracting recordings from calls...");
    const recordings = callsResponse
      .filter((call: any) => call.callRecord || call.recordingUri)
      .map((call: any) => ({
        id: `rec-${call.id}`,
        call_id: call.id, // Now this FK reference will exist
        recording_url:
          call.callRecord?.uri ||
          call.recordingUri ||
          call.recordingUrl ||
          null,
        duration_seconds: call.duration || 0,
        call_date: call.startTime || call.createdAt || new Date().toISOString(),
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

      console.log(`Inserted/upserted ${recsInserted || recordings.length} recordings`);
    }

    console.log("\n✅ Sync completed successfully!");
    console.log(`- Calls: ${callsToInsert.length}`);
    console.log(`- Recordings: ${recordings.length}`);
    process.exit(0);
  } catch (error) {
    console.error("Sync failed:", error.message);
    process.exit(1);
  }
}

syncRealMightyCallData();
