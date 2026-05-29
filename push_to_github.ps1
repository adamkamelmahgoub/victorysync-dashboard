Set-Location "C:\Users\kimo8\OneDrive\Desktop\victorysync-dashboard"

# Remove git lock if present
$lockFile = ".git\index.lock"
if (Test-Path $lockFile) {
    Remove-Item -Force $lockFile
    Write-Host "Removed git lock file"
}

# Stage all changes
git add -A
Write-Host "Staged all changes"

# Commit
git commit -m "feat: Google OAuth, lead list uploads, live status realtime, security hardening

New Features:
- Sign in with Google via Supabase OAuth with auto profile creation trigger
- Lead list CSV upload UI on LeadsPage (admin + client, drag-and-drop)
- Per-user can_upload_leads permission toggle (admin only)
- Public /api/leads/inbound endpoint (rate-limited, API-key protected)
- Audio chime notification on new lead list upload (Web Audio API)
- Upload history table (batch status tracking)
- Supabase Realtime on LiveStatusPage for instant on-call updates

Database (migration 012):
- lead_list_uploads table with RLS policies
- can_upload_leads BOOLEAN column on profiles
- lead_list_upload_id FK on leads
- Realtime enabled for agent_live_status, leads, lead_list_uploads
- handle_new_auth_user trigger for OAuth profile auto-creation

Security Fixes:
- /debug/status -> /api/debug/status, restricted to platform admins
- /s/recent and /s/series now require authenticated actorId
- Window type declarations for Clerk globals (global.d.ts)
- All TypeScript errors resolved (client + server)

Tests:
- 8/8 security_static tests pass
- 7/7 mightycall_normalization tests pass
- Both client and server tsc --noEmit clean"

Write-Host "Committed"

# Push
git push origin main
Write-Host "Pushed to GitHub"

Read-Host "Press Enter to close"
