-- ============================================================
-- Migration 012 FIXED - Part 2: Enable Realtime
-- Run this AFTER Part 1 succeeds
-- Each line must be run separately if you get "already in publication" errors
-- ============================================================

-- Enable Realtime on agent_live_status (this is what makes live status instant)
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_live_status;

-- Enable Realtime on leads
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- Enable Realtime on lead_list_uploads
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_list_uploads;
