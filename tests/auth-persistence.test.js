const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { GoTrueClient } = require('@supabase/auth-js');

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

function load(localStorage = storage()) {
  const window = { localStorage, sessionStorage: storage() };
  const exports = {};
  const source = fs.readFileSync('client/src/lib/authStorage.ts', 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  vm.runInNewContext(outputText, { exports, window, atob });
  return { ...exports, window };
}

const key = 'sb-test-auth-token';
const mfaKey = 'victorysync:mfa-verified:user-1';
const jwt = (sessionId, exp) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ session_id: sessionId, exp })).toString('base64url')}.signature`;

test('remembered login and MFA survive closing the tab', () => {
  const tab = load();
  tab.persistLoginChoice(true);
  tab.authStorage.setItem(key, 'session');
  tab.authStorage.setItem(mfaKey, 'login-1');
  const reopened = load(tab.window.localStorage);
  assert.equal(reopened.authStorage.getItem(key), 'session');
  assert.equal(reopened.authStorage.getItem(mfaKey), 'login-1');
});

test('unchecked remember me keeps credentials only in the current tab', () => {
  const tab = load();
  tab.persistLoginChoice(false);
  tab.authStorage.setItem(key, 'session');
  tab.authStorage.setItem(mfaKey, 'login-1');
  assert.equal(tab.authStorage.getItem(key), 'session');
  const reopened = load(tab.window.localStorage);
  assert.equal(reopened.authStorage.getItem(key), null);
  assert.equal(reopened.authStorage.getItem(mfaKey), null);
});

test('legacy local sessions are recovered without forcing a logout', () => {
  const tab = load();
  tab.window.localStorage.setItem(key, 'legacy-session');
  assert.equal(tab.authStorage.getItem(key), 'legacy-session');
  assert.equal(load(tab.window.localStorage).authStorage.getItem(key), 'legacy-session');
});

test('an explicit opt-out does not recover old local credentials', () => {
  const tab = load();
  tab.window.localStorage.setItem(key, 'stale-session');
  tab.persistLoginChoice(false);
  assert.equal(tab.authStorage.getItem(key), null);
  tab.authStorage.setItem(key, 'new-session');
  assert.equal(tab.window.localStorage.getItem(key), null);
});

test('logout removes the token and MFA from both storage locations', () => {
  const tab = load();
  tab.persistLoginChoice(true);
  for (const item of [key, mfaKey]) {
    tab.authStorage.setItem(item, 'value');
    tab.window.sessionStorage.setItem(item, 'stale-value');
    tab.authStorage.removeItem(item);
  }
  tab.clearLoginChoice();
  const reopened = load(tab.window.localStorage);
  assert.equal(reopened.authStorage.getItem(key), null);
  assert.equal(reopened.authStorage.getItem(mfaKey), null);
  assert.equal(tab.window.sessionStorage.getItem(key), null);
});

test('MFA is bound to the login and survives token rotation, not a new login', () => {
  const tab = load();
  assert.equal(tab.getLoginSessionId(jwt('login-1', 100)), 'login-1');
  assert.equal(tab.getLoginSessionId(jwt('login-1', 200)), 'login-1');
  assert.notEqual(tab.getLoginSessionId(jwt('login-2', 200)), 'login-1');
  assert.equal(tab.getLoginSessionId('invalid'), null);
});

test('Supabase refreshes an expired remembered session after reopening', async () => {
  const tab = load();
  tab.persistLoginChoice(true);
  const now = Math.floor(Date.now() / 1000);
  const user = { id: 'user-1', aud: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  tab.authStorage.setItem(key, JSON.stringify({ access_token: jwt('login-1', now - 60), refresh_token: 'old-refresh', expires_at: now - 60, token_type: 'bearer', user }));
  const reopened = load(tab.window.localStorage);
  let refreshes = 0;
  const client = new GoTrueClient({
    url: 'https://auth.example.test', storageKey: key, storage: reopened.authStorage,
    persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    fetch: async (url, init) => {
      if (String(url).includes('/token')) {
        refreshes++;
        assert.equal(JSON.parse(init.body).refresh_token, 'old-refresh');
        return new Response(JSON.stringify({ access_token: jwt('login-1', now + 3600), refresh_token: 'new-refresh', expires_in: 3600, token_type: 'bearer', user }), { status: 200 });
      }
      return new Response(JSON.stringify(user), { status: 200 });
    },
  });
  const { data, error } = await client.getSession();
  assert.equal(error, null);
  assert.equal(data.session.user.id, user.id);
  assert.equal(refreshes, 1);
  assert.equal(JSON.parse(load(tab.window.localStorage).authStorage.getItem(key)).refresh_token, 'new-refresh');
  await client.stopAutoRefresh();
});
