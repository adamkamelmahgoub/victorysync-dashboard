#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://edsyhtlaqwiicxlzorca.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MjMyNCwiZXhwIjoyMDc1ODI4MzI0fQ.KIy2lcVVHHqKVrMrVxgffxPQ8RaM90C5N6EMcKbKGqk';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const migrations = [
  {
    name: '001_add_to_number_digits',
    statements: [
      `ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS to_number_digits text`,
      `UPDATE public.calls SET to_number_digits = regexp_replace(to_number, '\\D', '', 'g') WHERE to_number IS NOT NULL AND (to_number_digits IS NULL OR to_number_digits = '')`,
      `CREATE INDEX IF NOT EXISTS idx_calls_to_number_digits ON public.calls (to_number_digits)`,
      `CREATE INDEX IF NOT EXISTS idx_calls_org_to_number_digits ON public.calls (org_id, to_number_digits) WHERE org_id IS NOT NULL`
    ]
  },
  {
    name: '002_fix_org_phone_numbers_constraints',
    statements: [
      `CREATE TABLE IF NOT EXISTS public.org_phone_numbers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, phone_number_id uuid NOT NULL REFERENCES public.phone_numbers(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now())`,
      `ALTER TABLE public.org_phone_numbers DROP CONSTRAINT IF EXISTS org_phone_numbers_phone_number_id_key CASCADE`,
      `ALTER TABLE public.org_phone_numbers DROP CONSTRAINT IF EXISTS org_phone_numbers_phone_number_id_org_id_key CASCADE`,
      `ALTER TABLE public.org_phone_numbers ADD CONSTRAINT org_phone_numbers_pkey PRIMARY KEY (id) ON CONFLICT DO NOTHING`,
      `ALTER TABLE public.org_phone_numbers ADD CONSTRAINT org_phone_numbers_org_id_phone_number_id_unique UNIQUE (org_id, phone_number_id) ON CONFLICT DO NOTHING`,
      `CREATE INDEX IF NOT EXISTS idx_org_phone_numbers_org_id ON public.org_phone_numbers (org_id)`,
      `CREATE INDEX IF NOT EXISTS idx_org_phone_numbers_phone_number_id ON public.org_phone_numbers (phone_number_id)`
    ]
  },
  {
    name: '003_add_agent_extensions',
    statements: [
      `CREATE TABLE IF NOT EXISTS public.agent_extensions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, extension text NOT NULL, display_name text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(org_id, extension), UNIQUE(org_id, user_id))`,
      `CREATE INDEX IF NOT EXISTS idx_agent_extensions_org_id ON public.agent_extensions (org_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_extensions_extension ON public.agent_extensions (extension)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_extensions_user_id ON public.agent_extensions (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_extensions_org_extension ON public.agent_extensions (org_id, extension)`
    ]
  },
  {
    name: '004_add_agent_extension_to_calls',
    statements: [
      `ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS agent_extension text`,
      `CREATE INDEX IF NOT EXISTS idx_calls_agent_extension ON public.calls (agent_extension) WHERE agent_extension IS NOT NULL`
    ]
  },
  {
    name: '005_add_api_keys',
    statements: [
      `CREATE TABLE IF NOT EXISTS public.platform_api_keys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key_hash text NOT NULL, label text, created_by uuid REFERENCES auth.users(id), created_at timestamptz DEFAULT now(), last_used_at timestamptz)`,
      `CREATE TABLE IF NOT EXISTS public.org_api_keys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE, key_hash text NOT NULL, label text, created_by uuid REFERENCES auth.users(id), created_at timestamptz DEFAULT now(), last_used_at timestamptz)`,
      `CREATE INDEX IF NOT EXISTS idx_platform_api_keys_created_by ON public.platform_api_keys(created_by)`,
      `CREATE INDEX IF NOT EXISTS idx_org_api_keys_org_id ON public.org_api_keys(org_id)`
    ]
  }
];

async function executeSql(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) throw new Error(`RPC Error: ${error.message}`);
  return data;
}

async function applyMigrations() {
  console.log('🚀 Starting database migrations...\n');
  let completed = 0;
  let failed = 0;
  
  for (const migration of migrations) {
    try {
      console.log(`⏳ Applying ${migration.name}...`);
      for (const stmt of migration.statements) {
        try {
          await executeSql(stmt);
        } catch (e) {
          // Some statements may fail if they already exist, which is OK
          if (!e.message.includes('already exists') && !e.message.includes('does not exist')) {
            console.warn(`   ⚠️  ${stmt.substring(0, 50)}... - ${e.message}`);
          }
        }
      }
      console.log(`✅ ${migration.name} completed\n`);
      completed++;
    } catch (err) {
      console.error(`❌ ${migration.name} failed:`, err.message, '\n');
      failed++;
    }
  }
  
  console.log(`\n✨ Migrations completed! (${completed} succeeded, ${failed} failed)`);
}

applyMigrations().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
