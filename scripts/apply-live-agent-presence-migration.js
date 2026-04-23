#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.join(process.cwd(), 'server', '.env') });
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[apply-live-agent-presence] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '016_live_agent_presence.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const statements = sql
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rpcAttempts = [
  { name: 'exec_sql', args: (statement) => ({ sql_query: statement }) },
  { name: 'exec', args: (statement) => ({ sql_query: statement }) },
  { name: 'exec', args: (statement) => ({ sql: statement }) },
  { name: 'pg_execute', args: (statement) => ({ query: statement }) },
];

async function executeStatement(statement) {
  const failures = [];
  for (const rpc of rpcAttempts) {
    try {
      const { error } = await supabase.rpc(rpc.name, rpc.args(statement));
      if (!error) return rpc.name;
      failures.push(`${rpc.name}: ${error.message || String(error)}`);
    } catch (error) {
      failures.push(`${rpc.name}: ${error?.message || String(error)}`);
    }
  }
  throw new Error(failures.join(' | ') || 'No SQL RPC was available');
}

async function run() {
  console.log(`[apply-live-agent-presence] Applying ${statements.length} statements from ${migrationPath}`);
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    const preview = statement.replace(/\s+/g, ' ').slice(0, 120);
    try {
      const rpcName = await executeStatement(statement);
      console.log(`[${index + 1}/${statements.length}] OK via ${rpcName}: ${preview}`);
    } catch (error) {
      console.error(`[${index + 1}/${statements.length}] FAILED: ${preview}`);
      console.error(String(error?.message || error));
      process.exit(1);
    }
  }
  console.log('[apply-live-agent-presence] Migration applied successfully');
}

run().catch((error) => {
  console.error('[apply-live-agent-presence] Fatal error:', error);
  process.exit(1);
});
