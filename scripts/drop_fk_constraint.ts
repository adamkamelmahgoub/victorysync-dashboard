import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function dropFK() {
  try {
    console.log("Attempting to drop FK constraint...");

    // Use raw SQL via RPC or direct query
    const { data, error } = await supabase.rpc("exec", {
      sql: "ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;",
    });

    if (error) {
      // If RPC doesn't work, try alternative approach via a different method
      console.log("RPC exec failed, trying alternative approach...");
      console.log("Error:", error.message);

      // Alternative: Use postgres.js directly if available
      console.log(
        "\nNote: To drop FK manually, run this in Supabase SQL Editor:"
      );
      console.log(
        "ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;"
      );
      process.exit(1);
    }

    console.log("FK constraint dropped successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    console.log(
      "\nManual fix: Copy & paste this into Supabase SQL Editor:"
    );
    console.log(
      "ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;"
    );
    process.exit(1);
  }
}

dropFK();
