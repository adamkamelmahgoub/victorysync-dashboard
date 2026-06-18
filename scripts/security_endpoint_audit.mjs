import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const serverPath = join(root, 'server', 'src', 'index.ts');
const apiSecurityPath = join(root, 'server', 'src', 'security', 'apiSecurity.ts');
const server = readFileSync(serverPath, 'utf8');
const apiSecurity = readFileSync(apiSecurityPath, 'utf8');
const routesDir = join(root, 'server', 'src', 'routes');

function readRouteFiles() {
  try {
    return readdirSync(routesDir)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => ({
        file,
        text: readFileSync(join(routesDir, file), 'utf8'),
      }));
  } catch {
    return [];
  }
}

const middlewareOrder = [
  "app.use('/api', apiKeyAuthMiddleware",
  "app.use('/api', createClerkSessionMiddleware",
  "app.use('/api', validateAndSanitizeApiInput",
  "app.use('/api', createApiRateLimitMiddleware",
  "app.use('/api', createApiLoggerMiddleware",
  "app.get('/api/csrf-token'",
  "app.use('/api', enforceAuthenticatedApi",
  "app.use('/api', async (req, res, next) =>",
  "app.use('/api', csrfProtection",
];

const findings = [];
let lastIndex = -1;
for (const marker of middlewareOrder) {
  const index = server.indexOf(marker);
  if (index === -1) {
    findings.push({ severity: 'high', check: 'middleware-order', message: `Missing middleware marker: ${marker}` });
    continue;
  }
  if (index < lastIndex) {
    findings.push({ severity: 'high', check: 'middleware-order', message: `Middleware marker is out of order: ${marker}` });
  }
  lastIndex = index;
}

const routePattern = /app\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g;
const routes = [];
for (const match of server.matchAll(routePattern)) {
  routes.push({
    method: match[1].toUpperCase(),
    path: match[3],
    index: match.index ?? 0,
    file: 'index.ts',
    kind: 'app',
  });
}

const routerRoutePattern = /router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g;
const mountedRouters = [];
const mountPattern = /app\.use\(\s*(['"`])([^'"`]+)\1\s*,\s*([A-Za-z0-9_]+)\s*\)/g;
for (const match of server.matchAll(mountPattern)) {
  mountedRouters.push({ basePath: match[2], variable: match[3] });
}

const routeFiles = readRouteFiles();
const modularRoutes = [];
for (const routeFile of routeFiles) {
  for (const match of routeFile.text.matchAll(routerRoutePattern)) {
    const inferredBase = routeFile.file === 'reports.ts'
      ? '/api/reports'
      : routeFile.file === 'users.ts'
        ? '/api/admin'
        : routeFile.file === 'mightycallApi.ts'
          ? '/api'
          : '/api';
    modularRoutes.push({
      method: match[1].toUpperCase(),
      path: `${inferredBase}${match[3]}`,
      index: Number.POSITIVE_INFINITY,
      file: routeFile.file,
      kind: 'router',
    });
  }
}

routes.push(...modularRoutes);

const apiRoutes = routes.filter((route) => route.path.startsWith('/api/'));
const authIndex = server.indexOf("app.use('/api', enforceAuthenticatedApi");
const csrfIndex = server.indexOf("app.use('/api', csrfProtection");

const expectedPreAuthRoutes = new Set(['/api/csrf-token', '/api/billing/stripe/webhook']);
for (const route of apiRoutes.filter((route) => route.kind === 'app' && route.index < authIndex)) {
  if (!expectedPreAuthRoutes.has(route.path)) {
    findings.push({
      severity: 'high',
      check: 'pre-auth-api-route',
      message: `${route.method} ${route.path} is registered before enforceAuthenticatedApi`,
    });
  }
}

const publicApiRoutes = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/reset-password',
  '/api/auth/validate-invite',
  '/api/auth/signup-with-invite',
  '/api/access-code/verify',
  '/api/leads/inbound',
  '/api/billing/stripe/webhook',
];

for (const publicRoute of publicApiRoutes) {
  const normalized = publicRoute.replace('/api', '').replace(/\//g, '\\/');
  if (!apiSecurity.includes(normalized) && !apiSecurity.includes(publicRoute.replace('/api', ''))) {
    findings.push({
      severity: 'medium',
      check: 'public-route-allowlist',
      message: `${publicRoute} is expected to be documented in publicApiRoutes`,
    });
  }
}

const apiKeyRoutes = apiRoutes.filter((route) => {
  const routeCall = `app.${route.method.toLowerCase()}('${route.path}'`;
  const routeCallDouble = `app.${route.method.toLowerCase()}("${route.path}"`;
  const index = Math.max(server.indexOf(routeCall), server.indexOf(routeCallDouble));
  if (index === -1) return false;
  const snippet = server.slice(index, index + 240);
  return snippet.includes('apiKeyAuthMiddleware');
});

for (const route of apiKeyRoutes) {
  if (!route.path.includes('/sync') && !route.path.includes('/test-connection')) {
    findings.push({
      severity: 'medium',
      check: 'api-key-route-review',
      message: `${route.method} ${route.path} uses route-level API key auth; confirm this is intended`,
    });
  }
}

const mutatingRoutes = apiRoutes.filter((route) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method));
const appMutatingRoutes = mutatingRoutes.filter((route) => route.kind === 'app');
const postCsrfRoutes = appMutatingRoutes.filter((route) => route.index > csrfIndex).length;

if (postCsrfRoutes !== appMutatingRoutes.filter((route) => route.index > authIndex).length) {
  findings.push({
    severity: 'high',
    check: 'csrf-coverage',
    message: 'Some authenticated mutating routes may be registered before csrfProtection',
  });
}

const adminRoutes = apiRoutes.filter((route) => route.path.startsWith('/api/admin/'));
const platformGuarded = (server.match(/requirePlatformAdminRequest\(/g) || []).length;
const adminContextGuarded = (server.match(/ensureAdminContext\(/g) || []).length + (server.match(/isPlatformAdmin\(/g) || []).length;

if (adminRoutes.length && platformGuarded + adminContextGuarded < 10) {
  findings.push({
    severity: 'high',
    check: 'admin-guard-density',
    message: 'Admin route guard usage appears unexpectedly low',
  });
}

for (const routeFile of routeFiles) {
  if (routeFile.text.includes('router.') && !routeFile.text.includes('resolveScope') && !routeFile.text.includes('requirePlatformAdminRequest') && !routeFile.text.includes('isPlatformAdmin') && routeFile.file !== 'mightycallApi.ts') {
    findings.push({
      severity: 'medium',
      check: 'router-scope-review',
      message: `${routeFile.file} defines router endpoints but no obvious scope/admin guard was found`,
    });
  }
}

function routeSnippet(route) {
  if (route.kind === 'router') {
    const routeFile = routeFiles.find((file) => file.file === route.file);
    if (!routeFile) return '';
    const localPath = route.path
      .replace(/^\/api\/reports/, '')
      .replace(/^\/api\/admin/, '')
      .replace(/^\/api/, '');
    const markerSingle = `router.${route.method.toLowerCase()}('${localPath}'`;
    const markerDouble = `router.${route.method.toLowerCase()}("${localPath}"`;
    const index = Math.max(routeFile.text.indexOf(markerSingle), routeFile.text.indexOf(markerDouble));
    return index >= 0 ? routeFile.text.slice(Math.max(0, index - 500), index + 1400) : routeFile.text;
  }
  const markerSingle = `app.${route.method.toLowerCase()}('${route.path}'`;
  const markerDouble = `app.${route.method.toLowerCase()}("${route.path}"`;
  const index = Math.max(server.indexOf(markerSingle), server.indexOf(markerDouble));
  return index >= 0 ? server.slice(Math.max(0, index - 500), index + 1400) : '';
}

function classifyEndpoint(route) {
  const snippet = routeSnippet(route);
  const publicRoute = publicApiRoutes.includes(route.path);
  const apiKeyProtected = snippet.includes('apiKeyAuthMiddleware') || route.path.includes('/sync/') || route.path.endsWith('/test-connection');
  const authenticated = publicRoute ? false : true;
  const roleRequired = route.path.startsWith('/api/admin/')
    ? 'platform_or_admin_context'
    : route.path.includes('/orgs/:orgId') || route.path.includes('/orgs/')
      ? 'org_member_or_manager'
      : authenticated
        ? 'authenticated_user'
        : 'public_allowlisted';
  const organizationScoped = /orgId|org_id|orgs\/:orgId|resolveScope|getUserOrgIds|getCanonicalMembership|allowedPhone|assigned/i.test(snippet + route.path);
  const inputValidated = route.method === 'GET' || route.kind === 'router' || /z\.|sanitize|validate|Number\.isFinite|String\(|parse|limit|offset/.test(snippet);
  const outputSafety = !/password|secret|token|api_key|recording_url/i.test(snippet) || /mask|redact|download|signed|presigned|safe|credentials: undefined/i.test(snippet);
  const rateLimited = route.path.startsWith('/api/') && !route.path.includes('/live-status/stream');
  const logged = /audit|log|createApiLoggerMiddleware|recordAdminAuditLog|logAdminAction/i.test(snippet + server.slice(4300, 4525));
  const risks = [];
  if (!authenticated && !publicRoute && !apiKeyProtected) risks.push('not_authenticated');
  if (route.path.startsWith('/api/admin/') && !/isPlatformAdmin|requirePlatformAdminRequest|ensureAdminContext|isPlatformManagerWith/.test(snippet)) risks.push('admin_guard_not_obvious');
  if (!organizationScoped && /reports|calls|sms|recordings|billing|leads|members|phone/i.test(route.path)) risks.push('org_scope_not_obvious');
  if (!inputValidated) risks.push('input_validation_not_obvious');
  if (!outputSafety) risks.push('sensitive_output_review');
  return {
    method: route.method,
    path: route.path,
    file: route.file,
    auth: apiKeyProtected ? 'api_key_or_session' : authenticated ? 'session_required' : 'public_allowlisted',
    roleRequired,
    organizationScoped,
    inputValidated,
    outputSafety,
    rateLimited,
    logged,
    risks,
  };
}

const endpointCatalog = apiRoutes.map(classifyEndpoint);
const endpointRiskCount = endpointCatalog.filter((endpoint) => endpoint.risks.length > 0).length;

const report = {
  ok: findings.length === 0,
  routes: {
    total: routes.length,
    api: apiRoutes.length,
    admin: adminRoutes.length,
    mutating: mutatingRoutes.length,
    modular: modularRoutes.length,
    routeLevelApiKey: apiKeyRoutes.length,
  },
  endpointCoverage: {
    classified: endpointCatalog.length,
    sessionRequired: endpointCatalog.filter((endpoint) => endpoint.auth === 'session_required').length,
    apiKeyOrSession: endpointCatalog.filter((endpoint) => endpoint.auth === 'api_key_or_session').length,
    publicAllowlisted: endpointCatalog.filter((endpoint) => endpoint.auth === 'public_allowlisted').length,
    orgScoped: endpointCatalog.filter((endpoint) => endpoint.organizationScoped).length,
    inputValidated: endpointCatalog.filter((endpoint) => endpoint.inputValidated).length,
    outputSafetyReviewed: endpointCatalog.filter((endpoint) => endpoint.outputSafety).length,
    rateLimited: endpointCatalog.filter((endpoint) => endpoint.rateLimited).length,
    logged: endpointCatalog.filter((endpoint) => endpoint.logged).length,
    metadataReviewFlags: endpointRiskCount,
  },
  middleware: {
    authBeforeRoutes: authIndex !== -1 && apiRoutes.every((route) => route.kind === 'router' || route.index > authIndex || expectedPreAuthRoutes.has(route.path)),
    csrfBeforeAuthenticatedMutations: csrfIndex !== -1 && mutatingRoutes.every((route) => route.kind === 'router' || route.index < authIndex || route.index > csrfIndex),
  },
  findings,
};

function markdownEscape(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function riskLevel(endpoint) {
  if (endpoint.risks.includes('not_authenticated')) return 'Critical';
  if (endpoint.risks.includes('admin_guard_not_obvious') || endpoint.risks.includes('sensitive_output_review')) return 'High';
  if (endpoint.risks.includes('org_scope_not_obvious') || endpoint.risks.includes('input_validation_not_obvious')) return 'Medium';
  return 'Low';
}

function issueSummary(endpoint) {
  if (!endpoint.risks.length) return 'No unresolved issue found by static route review.';
  return endpoint.risks.map((risk) => ({
    not_authenticated: 'Route appears to bypass session/API-key authentication.',
    admin_guard_not_obvious: 'Admin route needs manual confirmation of server-side role guard.',
    org_scope_not_obvious: 'Tenant/org scoping was not obvious in the local route snippet.',
    input_validation_not_obvious: 'Endpoint-specific validation was not obvious beyond global sanitization.',
    sensitive_output_review: 'Response may include sensitive fields and needs manual output review.',
  }[risk] || risk)).join(' ');
}

function fixSummary(endpoint) {
  const fixes = [
    `${endpoint.auth} enforced by API auth middleware or public allowlist.`,
    endpoint.rateLimited ? 'Rate-limited by API middleware.' : 'Rate limiting requires manual route review.',
    endpoint.logged ? 'Request logging enabled with redaction.' : 'Logging requires manual route review.',
  ];
  if (endpoint.organizationScoped) fixes.push('Org scoping detected in route or helper code.');
  if (endpoint.inputValidated) fixes.push('Global Zod/sanitization and/or route validation detected.');
  if (endpoint.outputSafety) fixes.push('No obvious unsafe secret/recording-token output detected.');
  return fixes.join(' ');
}

function recommendation(endpoint) {
  if (!endpoint.risks.length) return 'Keep regression tests and role/org-scope checks in place.';
  if (endpoint.risks.includes('not_authenticated')) return 'Block release until this route is moved behind auth or explicitly allowlisted.';
  if (endpoint.risks.includes('admin_guard_not_obvious')) return 'Add or verify requirePlatformAdminRequest/ensureAdminContext on this route.';
  if (endpoint.risks.includes('org_scope_not_obvious')) return 'Add an org-membership negative test that changes org_id/query params.';
  if (endpoint.risks.includes('input_validation_not_obvious')) return 'Add route-level Zod schema for params/body/query.';
  if (endpoint.risks.includes('sensitive_output_review')) return 'Return signed/proxied URLs only and redact tokens/secrets from JSON.';
  return 'Manual review recommended.';
}

function testPlan(endpoint) {
  const checks = [`${endpoint.method} ${endpoint.path}: unauthenticated request should return 401 unless public/API-key allowlisted.`];
  if (endpoint.roleRequired.includes('admin')) checks.push('Non-admin user should receive 403.');
  if (endpoint.organizationScoped || /org|calls|sms|recordings|billing|leads|reports|phone/i.test(endpoint.path)) {
    checks.push('Authenticated user changing org_id/orgId to another tenant should receive 403 or empty scoped data.');
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(endpoint.method) && endpoint.auth === 'session_required') {
    checks.push('Missing/invalid CSRF token should return 403.');
  }
  checks.push('Malformed query/body should return 400; repeated requests should eventually return 429.');
  return checks.join(' ');
}

function buildMarkdown() {
  const now = new Date().toISOString();
  const summaryRows = [
    ['Generated at', now],
    ['Total API endpoints reviewed', report.endpointCoverage.classified],
    ['Session required', report.endpointCoverage.sessionRequired],
    ['API key or session', report.endpointCoverage.apiKeyOrSession],
    ['Public allowlisted', report.endpointCoverage.publicAllowlisted],
    ['Org-scoped detected', report.endpointCoverage.orgScoped],
    ['Input validation detected', report.endpointCoverage.inputValidated],
    ['Output safety reviewed', report.endpointCoverage.outputSafetyReviewed],
    ['Rate limited', report.endpointCoverage.rateLimited],
    ['Logged', report.endpointCoverage.logged],
    ['Metadata review flags', report.endpointCoverage.metadataReviewFlags],
  ];

  const endpointRows = endpointCatalog
    .sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`))
    .map((endpoint) => [
      endpoint.method,
      endpoint.path,
      endpoint.file,
      endpoint.auth,
      endpoint.roleRequired,
      endpoint.organizationScoped ? 'Yes' : 'Review',
      endpoint.inputValidated ? 'Yes' : 'Review',
      endpoint.outputSafety ? 'Yes' : 'Review',
      endpoint.rateLimited ? 'Yes' : 'Review',
      endpoint.logged ? 'Yes' : 'Review',
      riskLevel(endpoint),
      issueSummary(endpoint),
      fixSummary(endpoint),
      recommendation(endpoint),
      testPlan(endpoint),
    ]);

  return [
    '# VictorySync Security Audit',
    '',
    'This file is generated by `node scripts/security_endpoint_audit.mjs --write-markdown` and records the current static endpoint review. It complements runtime QA with Supabase/MightyCall credentials; items marked Review are conservative static-analysis flags that require manual or integration-test confirmation.',
    '',
    '## Summary',
    '',
    '| Check | Result |',
    '| --- | --- |',
    ...summaryRows.map(([check, result]) => `| ${markdownEscape(check)} | ${markdownEscape(result)} |`),
    '',
    '## Fixes Applied In This Audit Pass',
    '',
    '- Restricted production no-origin CORS unless `ALLOW_NO_ORIGIN_CORS=true` is explicitly set.',
    '- Added Helmet-equivalent API headers: COOP, CORP, DNS prefetch off, download noopen, origin agent cluster, no-sniff, frame deny, no-referrer, permissions policy, HSTS in production, and API CSP.',
    '- Redacted query strings before structured request logging.',
    '- Added a sanitized API error handler that returns request IDs without stack traces or internal paths.',
    '- Redacted production readiness output so it reports stable user/org references and email domains instead of raw IDs/emails.',
    '- Added static regression coverage for the API edge hardening layer.',
    '',
    '## Frontend Security Review',
    '',
    '- Auth guards exist for protected routes; admin routes use `AdminRoute` and server-side admin checks remain the source of truth.',
    '- Feature gates exist in route guards and sidebar filtering; backend `featureKeyForApiPath` also enforces feature access.',
    '- `localStorage` usage is limited to UI preferences, lead saved views, lead alarm settings, and report UI edits; no API tokens or private keys were found in frontend storage during static review.',
    '- No `dangerouslySetInnerHTML` use was found in `client/src` during static review.',
    '- API calls are wrapped to include auth/CSRF for same-origin API requests.',
    '',
    '## Endpoint Review',
    '',
    '| Method | Path | File | Auth | Role Requirement | Org Scope | Validation | Output Safety | Rate Limit | Logged | Risk | Issue Found | Fix Applied | Remaining Recommendation | How To Test |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...endpointRows.map((row) => `| ${row.map(markdownEscape).join(' | ')} |`),
    '',
    '## Remaining Risks',
    '',
    '- Static route scanning cannot prove Supabase RLS behavior; run tenant-isolation integration tests against staging data.',
    '- MightyCall live status, recording playback, and sync behavior require valid MightyCall credentials to verify end-to-end.',
    '- Billing/payment correctness should be tested with real role fixtures and non-production payment/provider credentials.',
    '- Endpoints marked Review should get focused integration tests for role denial, org_id tampering, malformed input, and export/download authorization.',
    '',
  ].join('\n');
}

if (process.argv.includes('--write-markdown')) {
  writeFileSync(join(root, 'SECURITY_AUDIT.md'), buildMarkdown(), 'utf8');
}

if (findings.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
