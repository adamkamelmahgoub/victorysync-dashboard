# victorysync-dashboard

This repository contains a small demo app with a Node/Express backend that reads metrics from Supabase and a Vite + React + TypeScript + Tailwind frontend that shows a live KPI dashboard.

IMPORTANT: You must fill real values into the server `.env` before starting the server.

## Project layout

- `server/` - Node + TypeScript Express API that reads the `client_metrics_today` view from Supabase
- `client/` - Vite + React + TypeScript + Tailwind app that displays the dashboard card

## Quick start (Windows PowerShell)

1. Server

```powershell
cd server
npm install
# edit .env and set SUPABASE_URL and SUPABASE_SERVICE_KEY
npm run dev
```

Server will run on http://localhost:4000 by default.

2. Client

```powershell
cd client
npm install
npm run dev
```

Vite dev server will run on http://localhost:3000 by default. Open the page and it will render the Dashboard.

## Notes

- The server expects a Supabase view named `client_metrics_today` with columns: `org_id`, `total_calls`, `answered_calls`, `answer_rate_pct`, `avg_wait_seconds`.
- Replace the placeholder `ORG_ID` in `client/src/Dashboard.tsx` (the constant at the top of the file) with a real org id to fetch metrics.
- Do NOT commit real service keys into git. Keep `.env` out of source control.

If you'd like, I can also run `npm install` in each folder and start the dev servers for you, or add a single root-level workspace script to start both concurrently. Tell me which you'd prefer.
