import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function createExecSql() {
  const sql = `CREATE OR REPLACE FUNCTION public.exec_sql(sql_query text)
RETURNS json AS $$
BEGIN
  EXECUTE sql_query;
  RETURN json_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`;

  const { data, error } = await supabase.rpc('exec', { sql_query: sql });
  console.log('Create exec_sql result:', { data, error });

  if (!error) {
    console.log('exec_sql function created successfully');
  }
}

createExecSql().catch(console.error);