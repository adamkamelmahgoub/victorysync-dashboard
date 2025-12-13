/**
 * Frontend Configuration
 * 
 * PRODUCTION ENVIRONMENT VARIABLES (set these on Vercel):
 * - VITE_API_BASE_URL: The full URL to the deployed backend API server
 *   Example: https://victorysync-dashboard-server.vercel.app
 *   This is required for production. Without it, the app will default to `https://api.victorysync.com`.
 * 
 * - VITE_SUPABASE_URL: Supabase project URL (for direct client-side queries if used)
 * - VITE_SUPABASE_ANON_KEY: Supabase public key (for direct client-side queries if used)
 * 
 * LOCAL DEVELOPMENT:
 * - Use `VITE_API_BASE_URL` to point to your local backend if needed.
 * - Make sure the server is running: cd server && npm run dev
 */

export const TEST_ORG_ID = "d6b7bbde-54bb-4782-989d-cf9093f8cadf";

/**
 * API_BASE_URL
 * - In production, set VITE_API_BASE_URL environment variable on Vercel
 * - By default this app will use https://api.victorysync.com (do not rely on localhost)
 * - All API calls should use this base URL to ensure requests go to the correct backend
 */
/**
 * API base URL used by the frontend to call the backend.
 * - In production we MUST use the absolute URL including protocol and `/api` suffix.
 * - `VITE_API_BASE_URL` can override this in any environment.
 */
// Default to the public API endpoint `https://api.victorysync.com` unless
// overridden by `VITE_API_BASE_URL` environment variable (e.g. for staging).
// If you need to use a different host for local development, set
// `VITE_API_BASE_URL` when running the client.
// Default to same-origin when not explicitly set; this avoids making API calls
// to the production API host when running the static client locally.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Build a full API URL from a path
 * Handles the case where API_BASE_URL is empty (same-origin)
 */
export function buildApiUrl(path: string): string {
  // If empty, use same-origin (relative path works fine with fetch)
  if (!API_BASE_URL) {
    return path.startsWith('/') ? path : `/${path}`;
  }
  // If absolute URL, use it directly
  if (path.startsWith('http')) {
    return path;
  }
  // Otherwise, combine base URL with path
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
