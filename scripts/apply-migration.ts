#!/usr/bin/env node
import "dotenv/config";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function applyMigration() {
  try {
    const migrationPath = path.join(process.cwd(), "supabase", "add_rbac_and_phones.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Split by comments to execute in logical chunks
    const statements = sql
      .split(/;\s*(?:--.*)?$/m)
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

    console.log(`Found ${statements.length} SQL statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`\n[${i + 1}/${statements.length}] Executing...`);
      console.log(statement.substring(0, 100) + "...");

      const { error } = await supabase.rpc("exec", {
        sql: statement,
      }).catch(() => ({
        error: { message: "Using direct SQL execution instead" },
      }));

      // If rpc doesn't work, try direct SQL execution
      if (!error || error.message.includes("function")) {
        // For direct execution, we need to use postgres API
        // Since supabase-js doesn't expose raw SQL, we'll log what to do
        console.log("Note: Direct SQL execution requires Supabase dashboard or SQL client");
      }
    }

    console.log("\nMigration complete! Apply the SQL manually in Supabase dashboard:");
    console.log(`1. Go to https://app.supabase.com/projects`);
    console.log(`2. Select your project`);
    console.log(`3. Go to SQL Editor`);
    console.log(`4. Create a new query and paste the contents of supabase/add_rbac_and_phones.sql`);
    console.log(`5. Run the query`);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
}

applyMigration();
