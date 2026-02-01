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

async function checkCallsTableSchema() {
  try {
    console.log("Querying calls table schema...");
    
    // Get one row to see structure
    const { data, error } = await supabase
      .from("calls")
      .select("*")
      .limit(1);
    
    if (error) {
      console.error("Error querying calls:", error);
      process.exit(1);
    }
    
    if (data && data.length > 0) {
      console.log("\nCalls table columns (from first row):");
      console.log(Object.keys(data[0]).sort());
      console.log("\nFirst row sample:");
      console.log(JSON.stringify(data[0], null, 2));
    } else {
      console.log("Calls table is empty. Checking via raw SQL...");
      
      // Try raw SQL query
      const { data: schema, error: schemaError } = await supabase.rpc("exec", {
        sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'calls' ORDER BY column_name;`,
      });
      
      if (schemaError) {
        console.log("RPC exec not available, trying alternative...");
        console.log("Please check the calls table schema manually in Supabase SQL Editor");
      } else {
        console.log("\nCalls table schema:");
        console.log(schema);
      }
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

checkCallsTableSchema();
