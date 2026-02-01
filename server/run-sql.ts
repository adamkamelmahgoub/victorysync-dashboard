import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function runMigrations() {
  const statements = [
    // Create phone_numbers table
    `CREATE TABLE IF NOT EXISTS public.phone_numbers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      number text NOT NULL,
      external_id text UNIQUE NOT NULL,
      org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
      label text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(number)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_phone_numbers_org_id ON public.phone_numbers(org_id)`,
    `CREATE INDEX IF NOT EXISTS idx_phone_numbers_external_id ON public.phone_numbers(external_id)`,

    // Create org_members table
    `CREATE TABLE IF NOT EXISTS public.org_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('agent', 'org_manager', 'org_admin')),
      mightycall_extension text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(org_id, user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.org_members(org_id)`,
    `CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.org_members(user_id)`,

    // Enable RLS
    `ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY`,

    // Add RLS policies
    `DROP POLICY IF EXISTS "phone_numbers_admin_all" ON public.phone_numbers`,
    `CREATE POLICY "phone_numbers_admin_all" ON public.phone_numbers FOR ALL USING ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin') WITH CHECK ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin')`,
    `DROP POLICY IF EXISTS "org_members_admin_all" ON public.org_members`,
    `CREATE POLICY "org_members_admin_all" ON public.org_members FOR ALL USING ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin') WITH CHECK ((SELECT global_role FROM public.profiles WHERE id = auth.uid()) = 'platform_admin')`,
  ];

  for (const sql of statements) {
    try {
      console.log(`Running: ${sql.substring(0, 50)}...`);
      // Since we can't execute raw SQL, let's try using the REST API approach
      // For now, let's just log what we would run
      console.log('Would execute:', sql);
    } catch (e) {
      console.error('Error:', e);
    }
  }
}

runMigrations().catch(console.error);