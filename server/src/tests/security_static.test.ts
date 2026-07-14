import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(process.cwd(), '..');

test('admin recordings page does not expose raw recording URLs for playback', () => {
  const source = readFileSync(join(repoRoot, 'client', 'src', 'pages', 'admin', 'AdminRecordingsPage.tsx'), 'utf8');
  assert.match(source, /\/api\/recordings\/\$\{recording\.id\}\/download/);
  assert.doesNotMatch(source, /href=\{r\.recording_url\}/);
});

test('admin compatibility endpoints use platform-admin guard', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8');
  for (const action of [
    'admin.recordings.list',
    'admin.recordings.create',
    'admin.metrics.summary',
    'admin.metrics.volume',
    'admin.metrics.agents',
    'admin.metrics.agents_today',
    'admin.metrics.phones',
    'admin.stats',
    'admin.org_stats',
  ]) {
    assert.match(source, new RegExp(`requirePlatformAdminRequest\\(req, res, '${action}'\\)`));
  }
});

test('mcgraw now lead intake is external-key protected and duplicate aware', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8');
  const apiSecurity = readFileSync(join(process.cwd(), 'src', 'security', 'apiSecurity.ts'), 'utf8');
  const migration = readFileSync(join(repoRoot, 'supabase', 'migrations', '028_mcgrawnow_leads.sql'), 'utf8');

  assert.match(source, /app\.post\('\/api\/leads\/inbound'/);
  assert.match(source, /MCGRAWNOW_WEBHOOK_SECRET/);
  assert.match(source, /insertLogSafely\(supabaseAdmin, 'lead_duplicates'/);
  assert.match(source, /\.from\('lead_sources'\)/);
  assert.match(apiSecurity, /leads-inbound/);
  assert.match(apiSecurity, /requests: 500/);
  assert.match(migration, /create table if not exists public\.leads/);
  assert.match(migration, /alter table public\.leads enable row level security/);
  assert.match(migration, /alter publication supabase_realtime add table public\.leads/);
});

test('MightyCall webhook is provider-public but protected by a dedicated secret', () => {
  const apiSecurity = readFileSync(join(process.cwd(), 'src', 'security', 'apiSecurity.ts'), 'utf8');
  const indexSource = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8');
  assert.ok(apiSecurity.includes('/^\\/webhooks\\/mightycall$/'));
  assert.match(indexSource, /webhook_secret_not_configured/);
  assert.match(indexSource, /invalid_webhook_authentication/);
});

test('production rate limiting requires persistent redis unless explicitly bypassed', () => {
  const apiSecurity = readFileSync(join(process.cwd(), 'src', 'security', 'apiSecurity.ts'), 'utf8');
  assert.match(apiSecurity, /ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION/);
  assert.match(apiSecurity, /rate_limit_not_configured/);
});

test('api edge hardening uses restrictive cors, security headers, redacted query logs, and sanitized error handler', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8');
  assert.match(source, /ALLOW_NO_ORIGIN_CORS/);
  assert.match(source, /Cross-Origin-Opener-Policy/);
  assert.match(source, /Cross-Origin-Resource-Policy/);
  assert.match(source, /X-Download-Options/);
  assert.match(source, /query: stripSensitiveFields\(req\.query\)/);
  assert.match(source, /api\.request\.failed/);
  assert.match(source, /internal_server_error/);
});

test('production readiness output does not print raw user emails or ids', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'scripts', 'production_readiness_check.ts'), 'utf8');
  assert.match(source, /stableLabel/);
  assert.match(source, /email_domain/);
  assert.doesNotMatch(source, /email: user\.email/);
  assert.doesNotMatch(source, /id: user\.id/);
  assert.doesNotMatch(source, /membership,\n/);
});

test('debug auth page is admin-only in the router', () => {
  const source = readFileSync(join(repoRoot, 'client', 'src', 'main.tsx'), 'utf8');
  assert.match(source, /path="\/debug-auth"[\s\S]*?<AdminRoute>[\s\S]*?<DebugAuthPage \/>[\s\S]*?<\/AdminRoute>/);
});

test('feature access is database-backed and enforced in client routing', () => {
  const migration = readFileSync(join(repoRoot, 'supabase', 'migrations', '031_feature_access_and_security_verification.sql'), 'utf8');
  const server = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8');
  const router = readFileSync(join(repoRoot, 'client', 'src', 'main.tsx'), 'utf8');
  const sidebar = readFileSync(join(repoRoot, 'client', 'src', 'components', 'Sidebar.tsx'), 'utf8');

  assert.match(migration, /create table if not exists public\.org_feature_access/);
  assert.match(migration, /alter table public\.org_feature_access enable row level security/);
  assert.match(server, /app\.get\('\/api\/me\/features'/);
  assert.match(server, /app\.put\('\/api\/admin\/orgs\/:orgId\/features'/);
  assert.match(server, /featureKeyForApiPath/);
  assert.match(server, /feature_disabled/);
  assert.match(router, /function FeatureRoute/);
  assert.match(router, /featureAccessLoaded/);
  assert.match(sidebar, /featureAccess\[item\.featureKey\] !== false/);
});

test('leads endpoints use canonical organization membership lookup', () => {
  const server = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8');
  const leadsBlock = server.slice(
    server.indexOf("app.get('/api/leads/summary'"),
    server.indexOf("app.get('/api/admin/logs/summary'"),
  );

  assert.match(leadsBlock, /await getUserOrgIds\(actorId\)/);
  assert.match(leadsBlock, /isOrgMember\(actorId, orgId\)/);
  assert.doesNotMatch(leadsBlock, /from\('org_users'\)\.select\('org_id'\)\.eq\('user_id', actorId\)/);
  assert.doesNotMatch(leadsBlock, /from\('org_members'\)\s*\.select\('org_id'\)\s*\.eq\('user_id', actorId\)\s*\.maybeSingle/);
});

test('production diagnostics include live RLS and storage verification', () => {
  const migration = readFileSync(join(repoRoot, 'supabase', 'migrations', '031_feature_access_and_security_verification.sql'), 'utf8');
  const schemaHealth = readFileSync(join(process.cwd(), 'src', 'lib', 'schemaHealth.ts'), 'utf8');
  const server = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8');

  assert.match(migration, /security_table_rls_status/);
  assert.match(migration, /security_storage_bucket_status/);
  assert.match(schemaHealth, /getSecurityPolicyHealth/);
  assert.match(server, /security-policy-health/);
});
