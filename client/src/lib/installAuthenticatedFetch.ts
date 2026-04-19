import { API_BASE_URL } from "../config";
import { supabase } from "./supabaseClient";

let installed = false;

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

    return originalFetch(input, { ...init, headers });
  };
}
