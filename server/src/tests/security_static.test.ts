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
