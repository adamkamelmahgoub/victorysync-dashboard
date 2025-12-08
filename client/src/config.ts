/**
 * Frontend Configuration
 * 
 * PRODUCTION ENVIRONMENT VARIABLES (set these on Vercel):
 * - VITE_API_BASE_URL: The full URL to the deployed backend API server
 *   Example: https://victorysync-dashboard-server.vercel.app
 *   This is required for production. Without it, the app will default to http://localhost:4000
 *   which will fail in production.
 * 
 * - VITE_SUPABASE_URL: Supabase project URL (for direct client-side queries if used)
 * - VITE_SUPABASE_ANON_KEY: Supabase public key (for direct client-side queries if used)
 * 
 * LOCAL DEVELOPMENT:
 * - No special setup needed; the app defaults to http://localhost:4000 for the API
 * - Make sure the server is running: cd server && npm run dev
 */

export const TEST_ORG_ID = "d6b7bbde-54bb-4782-989d-cf9093f8cadf";

/**
 * API_BASE_URL
 * - In production, set VITE_API_BASE_URL environment variable on Vercel
 * - In development, defaults to http://localhost:4000
 * - All API calls should use this base URL to ensure requests go to the correct backend
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
