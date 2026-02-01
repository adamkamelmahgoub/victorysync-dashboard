Edge Function: mightycall-sync

Purpose:
- Lightweight HTTP handler to trigger the platform server's MightyCall sync endpoints from a scheduled runner or external webhook.

Environment:
- `SERVER_ADMIN_URL` - base URL of the platform server (e.g. https://api.example.com)
- `SERVER_SERVICE_KEY` - a secret service key allowed to call protected server endpoints (server must accept `x-service-key` header)

Usage:
- Deploy this file as an Edge Function and configure env vars.
- Call the function with method POST and optional body to forward to the platform sync endpoints.
