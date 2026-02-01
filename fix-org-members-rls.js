#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRole);

async function fixOrgMembersRLS() {
  try {
    console.log('Fixing org_members RLS policy...');
    
    // Drop the problematic policy
    const dropResult = await supabase.rpc('exec_sql', {
      sql: 'DROP POLICY IF EXISTS "org_members_org_read" ON public.org_members;'
    }).then(r => {
      console.log('Drop result:', r);
      return r;
    }).catch(e => {
      console.warn('Drop policy failed (may be normal):', e.message);
    });

    // Create the fixed policy
    const createResult = await supabase.rpc('exec_sql', {
      sql: `CREATE POLICY "org_members_org_read"
ON public.org_members
FOR SELECT
USING (
  org_id IN (SELECT org_id FROM public.org_users WHERE user_id = auth.uid())
);`
    }).then(r => {
      console.log('Create result:', r);
      return r;
    }).catch(e => {
      console.error('Create policy failed:', e.message);
      throw e;
    });

    console.log('✓ org_members RLS policy fixed successfully');
  } catch (error) {
    console.error('Failed to fix RLS:', error);
    process.exit(1);
  }
}

fixOrgMembersRLS();
