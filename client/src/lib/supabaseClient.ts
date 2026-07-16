import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

const REMEMBER_LOGIN_KEY = "victorysync:remember-login";

// Supabase normally always uses localStorage. Route its session through the
// storage selected on the login form so an unchecked "Keep me signed in"
// session really disappears when the browser session ends.
const authStorage = {
  getItem(key: string) {
    try {
      return window.localStorage.getItem(REMEMBER_LOGIN_KEY) === "true"
        ? window.localStorage.getItem(key)
        : window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    if (window.localStorage.getItem(REMEMBER_LOGIN_KEY) === "true") {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: authStorage,
  },
});
