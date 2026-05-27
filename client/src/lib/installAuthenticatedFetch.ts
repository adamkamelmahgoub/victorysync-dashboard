import { API_BASE_URL } from "../config";
import { supabase } from "./supabaseClient";

let installed = false;
let csrfTokenCache: { token: string; fetchedAt: number } | null = null;

function shouldAttachAuth(input: RequestInfo | URL): boolean {
  const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!target) return false;

  try {
    if (target.startsWith("/")) return target.startsWith("/api");
    const url = new URL(target, window.location.origin);
    if (url.origin === window.location.origin) return url.pathname.startsWith("/api");
    if (!API_BASE_URL) return false;
    const apiOrigin = new URL(API_BASE_URL, window.location.origin).origin;
    return url.origin === apiOrigin;
  } catch {
    return false;
  }
}

export function installAuthenticatedFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  async function getCsrfToken(headers: Headers): Promise<string | null> {
    if (csrfTokenCache && Date.now() - csrfTokenCache.fetchedAt < 10 * 60 * 1000) {
      return csrfTokenCache.token;
    }
    const url = `${API_BASE_URL.replace(/\/$/, "")}/api/csrf-token`;
    const response = await originalFetch(url, { headers, cache: "no-store" }).catch(() => null);
    if (!response?.ok) return null;
    const json = await response.json().catch(() => null);
    const token = typeof json?.csrfToken === "string" ? json.csrfToken : null;
    if (token) csrfTokenCache = { token, fetchedAt: Date.now() };
    return token;
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!shouldAttachAuth(input)) {
      return originalFetch(input, init);
    }

    const request = new Request(input, init);
    const headers = new Headers(request.headers);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const accessToken = session?.access_token || null;
      const userId = session?.user?.id || null;

      if (accessToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }

      if (userId && !headers.has("x-user-id")) {
        // Kept for temporary backward compatibility while the API is migrated away from this header.
        headers.set("x-user-id", userId);
      }
    } catch (err) {
      console.warn("[auth-fetch] Failed to resolve session for API request", err);
    }

    const method = String(init?.method || request.method || "GET").toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !headers.has("x-csrf-token")) {
      const token = await getCsrfToken(headers);
      if (token) headers.set("x-csrf-token", token);
    }

    return originalFetch(input, { ...init, headers });
  };
}
