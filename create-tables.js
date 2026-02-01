require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function createMissingTables() {
  console.log('=== CREATING MISSING DATABASE TABLES ===');

  const migrations = [
    // Team members table
    {
      name: 'team_members',
      sql: `
        CREATE TABLE IF NOT EXISTS team_members (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'agent')),
          name TEXT,
          email TEXT,
          phone TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(org_id, user_id)
        );

        ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Users can view team members in their org" ON team_members
          FOR SELECT USING (org_id IN (
            SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid()
          ));

        CREATE POLICY "Admins can manage team members" ON team_members
          FOR ALL USING (
            EXISTS (
              SELECT 1 FROM user_org_memberships uom
              WHERE uom.user_id = auth.uid() AND uom.org_id = team_members.org_id
              AND uom.role IN ('admin', 'manager')
            )
          );
      `
    },

    // Support tickets system
    {
      name: 'support_tickets',
      sql: `
        CREATE TABLE IF NOT EXISTS support_tickets (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          subject TEXT NOT NULL,
          priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'closed')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Users can view their org's tickets" ON support_tickets
          FOR SELECT USING (org_id IN (
            SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid()
          ));

        CREATE POLICY "Users can create tickets for their org" ON support_tickets
          FOR INSERT WITH CHECK (org_id IN (
            SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid()
          ) AND created_by = auth.uid());

        CREATE POLICY "Admins can update tickets" ON support_tickets
          FOR UPDATE USING (
            EXISTS (
              SELECT 1 FROM user_org_memberships uom
              WHERE uom.user_id = auth.uid() AND uom.org_id = support_tickets.org_id
              AND uom.role IN ('admin', 'manager')
            )
          );
      `
    },

    // Support ticket messages
    {
      name: 'support_ticket_messages',
      sql: `
        CREATE TABLE IF NOT EXISTS support_ticket_messages (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
          sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Users can view messages for their org's tickets" ON support_ticket_messages
          FOR SELECT USING (
            ticket_id IN (
              SELECT st.id FROM support_tickets st
              WHERE st.org_id IN (
                SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid()
              )
            )
          );

        CREATE POLICY "Users can send messages for their org's tickets" ON support_ticket_messages
          FOR INSERT WITH CHECK (
            ticket_id IN (
              SELECT st.id FROM support_tickets st
              WHERE st.org_id IN (
                SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid()
              )
            ) AND sender_user_id = auth.uid()
          );
      `
    },

    // Phone number requests
    {
      name: 'phone_number_requests',
      sql: `
        CREATE TABLE IF NOT EXISTS phone_number_requests (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          requested_number TEXT NOT NULL,
          requested_label TEXT,
          reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          reviewed_at TIMESTAMP WITH TIME ZONE,
          reviewed_by UUID REFERENCES auth.users(id)
        );

        ALTER TABLE phone_number_requests ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Users can view their org's requests" ON phone_number_requests
          FOR SELECT USING (org_id IN (
            SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid()
          ));

        CREATE POLICY "Users can create requests for their org" ON phone_number_requests
          FOR INSERT WITH CHECK (org_id IN (
            SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid()
          ) AND requested_by = auth.uid());

        CREATE POLICY "Admins can update requests" ON phone_number_requests
          FOR UPDATE USING (
            EXISTS (
              SELECT 1 FROM user_org_memberships uom
              JOIN organizations o ON o.id = uom.org_id
              WHERE uom.user_id = auth.uid() AND uom.org_id = phone_number_requests.org_id
              AND (uom.role IN ('admin', 'manager') OR o.created_by = auth.uid())
            )
          );
      `
    },

    // Billing packages
    {
      name: 'billing_packages',
      sql: `
        CREATE TABLE IF NOT EXISTS billing_packages (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          price_monthly DECIMAL(10,2) NOT NULL,
          price_yearly DECIMAL(10,2) NOT NULL,
          features JSONB DEFAULT '[]'::jsonb,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        ALTER TABLE billing_packages ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Anyone can view active packages" ON billing_packages
          FOR SELECT USING (is_active = true);

        CREATE POLICY "Only platform admins can manage packages" ON billing_packages
          FOR ALL USING (
            EXISTS (
              SELECT 1 FROM platform_api_keys
              WHERE key_hash = encode(digest(current_setting('request.jwt.claims', true)::json->>'api_key', 'sha256'), 'hex')
              AND created_by IN (
                SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'platform_admin'
              )
            )
          );
      `
    },

    // Organization packages
    {
      name: 'org_packages',
      sql: `
        CREATE TABLE IF NOT EXISTS org_packages (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          package_id UUID NOT NULL REFERENCES billing_packages(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
          current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
          current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        ALTER TABLE org_packages ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Users can view their org's packages" ON org_packages
          FOR SELECT USING (org_id IN (
            SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid()
          ));

        CREATE POLICY "Admins can manage org packages" ON org_packages
          FOR ALL USING (
            EXISTS (
              SELECT 1 FROM user_org_memberships uom
              WHERE uom.user_id = auth.uid() AND uom.org_id = org_packages.org_id
              AND uom.role IN ('admin', 'manager')
            )
          );
      `
    },

    // Call reports
    {
      name: 'call_reports',
      sql: `
        CREATE TABLE IF NOT EXISTS call_reports (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
          phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE CASCADE,
          report_type TEXT NOT NULL,
          report_date DATE NOT NULL,
          total_calls INTEGER DEFAULT 0,
          answered_calls INTEGER DEFAULT 0,
          avg_wait_seconds DECIMAL(10,2) DEFAULT 0,
          data JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        ALTER TABLE call_reports ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Users can view their org's reports" ON call_reports
          FOR SELECT USING (org_id IN (
            SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid()
          ));

        CREATE POLICY "Platform admins can manage all reports" ON call_reports
          FOR ALL USING (
            EXISTS (
              SELECT 1 FROM platform_api_keys
              WHERE key_hash = encode(digest(current_setting('request.jwt.claims', true)::json->>'api_key', 'sha256'), 'hex')
            )
          );
      `
    },

    // Call recordings
    {
      name: 'call_recordings',
      sql: `
        CREATE TABLE IF NOT EXISTS call_recordings (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
          phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE CASCADE,
          call_id TEXT NOT NULL,
          recording_date TIMESTAMP WITH TIME ZONE NOT NULL,
          duration_seconds INTEGER,
          recording_url TEXT,
          data JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Users can view their org's recordings" ON call_recordings
          FOR SELECT USING (org_id IN (
            SELECT org_id FROM user_org_memberships WHERE user_id = auth.uid()
          ));

        CREATE POLICY "Platform admins can manage all recordings" ON call_recordings
          FOR ALL USING (
            EXISTS (
              SELECT 1 FROM platform_api_keys
              WHERE key_hash = encode(digest(current_setting('request.jwt.claims', true)::json->>'api_key', 'sha256'), 'hex')
            )
          );
      `
    },

    // Integration sync jobs
    {
      name: 'integration_sync_jobs',
      sql: `
        CREATE TABLE IF NOT EXISTS integration_sync_jobs (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          job_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
          started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          completed_at TIMESTAMP WITH TIME ZONE,
          records_processed INTEGER DEFAULT 0,
          error_message TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        ALTER TABLE integration_sync_jobs ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "Platform admins can view all sync jobs" ON integration_sync_jobs
          FOR ALL USING (
            EXISTS (
              SELECT 1 FROM platform_api_keys
              WHERE key_hash = encode(digest(current_setting('request.jwt.claims', true)::json->>'api_key', 'sha256'), 'hex')
            )
          );
      `
    }
  ];

  for (const migration of migrations) {
    try {
      console.log(`Creating table: ${migration.name}...`);
      const result = await supabase.rpc('exec_sql', { sql: migration.sql });
      if (result.error) {
        console.log(`❌ Error creating ${migration.name}:`, result.error.message);
      } else {
        console.log(`✅ Created table: ${migration.name}`);
      }
    } catch (error) {
      console.log(`❌ Error creating ${migration.name}:`, error.message);
    }
  }

  console.log('\n=== MIGRATION COMPLETE ===');
  console.log('All missing tables have been created with proper RLS policies.');
}

createMissingTables().catch(console.error);