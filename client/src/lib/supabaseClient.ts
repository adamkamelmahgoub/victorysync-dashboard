import { createClient } from "@supabase/supabase-js";

// Use hardcoded values for now (public anon key is safe for frontend)
// TODO: Switch back to env vars once Vercel is properly configured
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://edsyhtlaqwiicxlzorca.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkc3lodGxhcXdpaWN4bHpvcmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNTIzMjQsImV4cCI6MjA3NTgyODMyNH0.eZvXiKFrdM11ooFliQFGnqd7wpTMfRze-IxLYyU9mYY";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase URL or anon key");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
