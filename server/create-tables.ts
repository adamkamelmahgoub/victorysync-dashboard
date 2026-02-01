import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function createTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS public.org_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      user_id uuid NOT NULL,
      role text NOT NULL CHECK (role IN ('agent', 'org_manager', 'org_admin')),
      mightycall_extension text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(org_id, user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.org_members(org_id)`,
    `CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.org_members(user_id)`,
    `ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "org_members_admin_all" ON public.org_members`,
    `CREATE POLICY "org_members_admin_all" ON public.org_members FOR ALL USING ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin') WITH CHECK ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin')`,
  ];

  for (const sql of statements) {
    try {
      console.log(`Executing: ${sql.substring(0, 50)}...`);
      // Try different RPC functions
      let result;
      try {
        result = await supabase.rpc('pg_execute', { query: sql });
      } catch (e) {
        try {
          result = await supabase.rpc('exec_sql', { sql_query: sql });
        } catch (e2) {
          console.log('Both RPC methods failed, skipping:', sql.substring(0, 50));
          continue;
        }
      }
      console.log('Success:', result);
    } catch (e) {
      console.error('Error:', (e as any).message);
    }
  }
}

createTables().catch(console.error);