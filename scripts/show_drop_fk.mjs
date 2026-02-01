import { createClient } from "@supabase/supabase-js";
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

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function dropFKConstraint() {
  try {
    console.log(
      "Attempting to drop FK constraint mightycall_recordings_call_id_fkey..."
    );

    // Try using Supabase's built-in functions or raw query
    // Since we can't directly execute raw SQL via the client SDK,
    // we'll need to use the Supabase SQL Editor or PostgreSQL connection
    console.log(
      "\nTo drop the FK constraint, run this SQL in Supabase SQL Editor:"
    );
    console.log(
      "ALTER TABLE public.mightycall_recordings DROP CONSTRAINT IF EXISTS mightycall_recordings_call_id_fkey;"
    );
    console.log(
      "\nAfter running that, the sync can proceed without FK validation."
    );

    process.exit(0);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

dropFKConstraint();
