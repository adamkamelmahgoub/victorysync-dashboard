require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function createTablesIndividually() {
  console.log('=== CREATING TABLES INDIVIDUALLY ===');

  const tables = [
    {
      name: 'team_members',
      sql: `
        CREATE TABLE IF NOT EXISTS public.team_members (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          role text NOT NULL CHECK (role IN ('admin', 'manager', 'agent')),
          name text,
          email text,
          phone text,
          is_active boolean DEFAULT true,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now(),
          UNIQUE(org_id, user_id)
        );
      `
    },
    {
      name: 'support_tickets',
      sql: `
        CREATE TABLE IF NOT EXISTS public.support_tickets (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
          created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          subject text NOT NULL,
          priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
          status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'closed')),
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
      `
    },
    {
      name: 'support_ticket_messages',
      sql: `
        CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
          sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          message text NOT NULL,
          created_at timestamptz DEFAULT now()
        );
      `
    },
    {
      name: 'phone_number_requests',
      sql: `
        CREATE TABLE IF NOT EXISTS public.phone_number_requests (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
          requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          requested_number text NOT NULL,
          requested_label text,
          reason text NOT NULL,
          status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          created_at timestamptz DEFAULT now(),
          reviewed_at timestamptz,
          reviewed_by uuid REFERENCES auth.users(id)
        );
      `
    },
    {
      name: 'billing_packages',
      sql: `
        CREATE TABLE IF NOT EXISTS public.billing_packages (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          name text NOT NULL,
          description text NOT NULL,
          price_monthly decimal(10,2) NOT NULL,
          price_yearly decimal(10,2) NOT NULL,
          features jsonb DEFAULT '[]'::jsonb,
          is_active boolean DEFAULT true,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
      `
    },
    {
      name: 'org_packages',
      sql: `
        CREATE TABLE IF NOT EXISTS public.org_packages (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
          package_id uuid NOT NULL REFERENCES public.billing_packages(id) ON DELETE CASCADE,
          status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
          current_period_start timestamptz NOT NULL,
          current_period_end timestamptz NOT NULL,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
      `
    },
    {
      name: 'call_reports',
      sql: `
        CREATE TABLE IF NOT EXISTS public.call_reports (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
          phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
          report_type text NOT NULL,
          report_date date NOT NULL,
          total_calls integer DEFAULT 0,
          answered_calls integer DEFAULT 0,
          avg_wait_seconds decimal(10,2) DEFAULT 0,
          data jsonb DEFAULT '{}'::jsonb,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
      `
    },
    {
      name: 'call_recordings',
      sql: `
        CREATE TABLE IF NOT EXISTS public.call_recordings (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
          phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
          call_id text NOT NULL,
          recording_date timestamptz NOT NULL,
          duration_seconds integer,
          recording_url text,
          data jsonb DEFAULT '{}'::jsonb,
          created_at timestamptz DEFAULT now()
        );
      `
    },
    {
      name: 'integration_sync_jobs',
      sql: `
        CREATE TABLE IF NOT EXISTS public.integration_sync_jobs (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          job_type text NOT NULL,
          status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
          started_at timestamptz DEFAULT now(),
          completed_at timestamptz,
          records_processed integer DEFAULT 0,
          error_message text,
          created_at timestamptz DEFAULT now()
        );
      `
    }
  ];

  for (const table of tables) {
    try {
      console.log(`Creating table: ${table.name}...`);

      // Try using a direct query approach
      const { data, error } = await supabase
        .from('pg_tables')
        .select('tablename')
        .eq('schemaname', 'public')
        .eq('tablename', table.name)
        .limit(1);

      if (error || !data || data.length === 0) {
        console.log(`Table ${table.name} doesn't exist, would create it.`);
        console.log('Please run this SQL manually in Supabase SQL Editor:');
        console.log(table.sql);
        console.log('---');
      } else {
        console.log(`✅ Table ${table.name} already exists`);
      }

    } catch (error) {
      console.log(`❌ Error checking table ${table.name}:`, error.message);
      console.log('Please run this SQL manually in Supabase SQL Editor:');
      console.log(table.sql);
      console.log('---');
    }
  }

  console.log('\n=== MANUAL SQL EXECUTION REQUIRED ===');
  console.log('Copy and paste the SQL statements above into your Supabase SQL Editor');
  console.log('Then run the RLS policies and default data inserts from MASTER_MIGRATION.sql');
}

createTablesIndividually().catch(console.error);