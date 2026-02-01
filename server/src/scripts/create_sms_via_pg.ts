import '../config/env';
import * as pg from 'pg';

async function main() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[create_sms_via_pg] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
      process.exit(1);
    }

    // Extract connection params from Supabase URL
    // Format: https://project-id.supabase.co
    const projectId = supabaseUrl.split('//')[1].split('.')[0];
    const dbHost = `${projectId}.supabase.co`;
    
    // Use postgres default database
    const client = new pg.Client({
      host: dbHost,
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: supabaseServiceKey, // Service key IS the postgres password in Supabase
      ssl: { rejectUnauthorized: false }
    });

    console.log('[create_sms_via_pg] Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('[create_sms_via_pg] Connected!');

    const sql = `
      CREATE TABLE IF NOT EXISTS public.mightycall_sms_messages (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
        phone_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
        external_id text,
        external_sms_id text,
        from_number text,
        to_number text,
        sender text,
        recipient text,
        direction text,
        status text,
        message text,
        body text,
        message_date timestamptz,
        sent_at timestamptz,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(org_id, external_id),
        UNIQUE(org_id, external_sms_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_mightycall_sms_org_id ON public.mightycall_sms_messages(org_id);
      CREATE INDEX IF NOT EXISTS idx_mightycall_sms_sent_at ON public.mightycall_sms_messages(sent_at DESC);
    `;

    console.log('[create_sms_via_pg] Creating mightycall_sms_messages table...');
    
    // Split into separate statements and execute
    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        await client.query(stmt.trim());
      }
    }
    
    console.log('[create_sms_via_pg] ✅ Table and indexes created successfully!');
    
    // Verify table exists
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mightycall_sms_messages'`
    );
    
    if (result.rows.length > 0) {
      console.log('[create_sms_via_pg] ✅ Verified: mightycall_sms_messages table exists');
    }
    
    await client.end();
    process.exit(0);
  } catch (e: any) {
    console.error('[create_sms_via_pg] error:', e.message || e);
    process.exit(1);
  }
}

main();
