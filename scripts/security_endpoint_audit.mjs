import { readdirSync, readFileSync } from 'node:fs';
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

const expectedPreAuthRoutes = new Set(['/api/csrf-token']);
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
  middleware: {
    authBeforeRoutes: authIndex !== -1 && apiRoutes.every((route) => route.kind === 'router' || route.index > authIndex || expectedPreAuthRoutes.has(route.path)),
    csrfBeforeAuthenticatedMutations: csrfIndex !== -1 && mutatingRoutes.every((route) => route.kind === 'router' || route.index < authIndex || route.index > csrfIndex),
  },
  findings,
};

if (findings.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
