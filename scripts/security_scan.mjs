import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.startsWith('client/dist/') && !file.startsWith('dist/') && !file.includes('/node_modules/'));

const checks = [
  {
    id: 'committed-env-files',
    severity: 'high',
    testFile: (file) => /^(\.env|.*\/\.env)(\.|$)/.test(file) && !file.endsWith('.env.example') && file !== '.env.example',
    message: 'Environment file is tracked by git.',
  },
  {
    id: 'jwt-or-live-secret',
    severity: 'high',
    pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]+/g,
    message: 'Possible committed token/secret.',
  },
  {
    id: 'live-secret-example',
    severity: 'medium',
    pattern: /sk_live_[A-Za-z0-9]+/g,
    allow: (file, match) => ['API_REFERENCE.md', 'SECURITY_AUDIT.md'].some((allowed) => file.endsWith(allowed)) && match === 'sk_live_1234567890abcdef',
    message: 'Possible live payment/API key.',
  },
  {
    id: 'frontend-service-secret-env',
    severity: 'high',
    pattern: /\bVITE_[A-Z0-9_]*(SERVICE|SERVICE_ROLE|SECRET|PRIVATE)[A-Z0-9_]*/g,
    allow: (file) => file.endsWith('SECURITY_AUDIT.md'),
    message: 'Frontend-style env name appears to reference a private secret.',
  },
  {
    id: 'wildcard-cors-header',
    severity: 'high',
    pattern: /Access-Control-Allow-Origin["']?\s*:\s*["']\*/g,
    message: 'Wildcard CORS header found.',
  },
  {
    id: 'raw-realtime-console',
    severity: 'medium',
    pattern: /console\.log\([^)]*\[Realtime\][^)]*payload\.(new|old)/g,
    message: 'Realtime payload logging can expose tenant data.',
  },
];

const findings = [];

for (const file of files) {
  const fullPath = join(root, file);
  if (!existsSync(fullPath)) continue;

  for (const check of checks) {
    if (check.testFile?.(file)) {
      findings.push({ file, check: check.id, severity: check.severity, message: check.message });
    }
  }

  if (!/\.(js|jsx|ts|tsx|mjs|cjs|json|md|sql|yml|yaml|html|css)$/.test(file)) continue;
  const text = readFileSync(fullPath, 'utf8');

  for (const check of checks) {
    if (!check.pattern) continue;
    check.pattern.lastIndex = 0;
    for (const match of text.matchAll(check.pattern)) {
      if (check.allow?.(file, match[0])) continue;
      findings.push({
        file,
        check: check.id,
        severity: check.severity,
        message: check.message,
        sample: match[0].slice(0, 80),
      });
    }
  }
}

if (findings.length) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, scannedFiles: files.length, findings: [] }, null, 2));
