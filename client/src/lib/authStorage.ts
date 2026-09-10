const REMEMBER_LOGIN_KEY = "victorysync:remember-login";
const TAB_LOGIN_KEY = "victorysync:tab-login";

export function persistLoginChoice(rememberLogin: boolean) {
  window.localStorage.setItem(REMEMBER_LOGIN_KEY, String(rememberLogin));
  if (rememberLogin) window.sessionStorage.removeItem(TAB_LOGIN_KEY);
  else window.sessionStorage.setItem(TAB_LOGIN_KEY, "true");
}

export function clearLoginChoice() {
  window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
  window.sessionStorage.removeItem(TAB_LOGIN_KEY);
}

export const authStorage = {
  getItem(key: string): string | null {
    const choice = window.localStorage.getItem(REMEMBER_LOGIN_KEY);
    if (choice === "true") return window.localStorage.getItem(key);
    const tabValue = window.sessionStorage.getItem(key);
    if (tabValue !== null || choice === "false") return tabValue;
    // Recover sessions saved before the remember-login preference was introduced.
    const legacyValue = window.localStorage.getItem(key);
    if (legacyValue !== null) persistLoginChoice(true);
    return legacyValue;
  },
  setItem(key: string, value: string) {
    const remember = window.localStorage.getItem(REMEMBER_LOGIN_KEY) === "true";
    const target = remember ? window.localStorage : window.sessionStorage;
    const other = remember ? window.sessionStorage : window.localStorage;
    target.setItem(key, value);
    other.removeItem(key);
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

// Bind the existing MFA gate to this login, not just the user or access token.
// Supabase preserves session_id when it rotates access/refresh tokens.
export function getLoginSessionId(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const sessionId = JSON.parse(atob(payload)).session_id;
    return typeof sessionId === "string" && sessionId ? sessionId : null;
  } catch {
    return null;
  }
}
