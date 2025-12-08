# VictorySync Dashboard - Setup & Integration Guide

## Files Changed

### Backend (`server/`)
- ✅ `server/src/index.ts` — Updated to query `client_metrics_today` Supabase view directly (no fallback for missing credentials)
- ✅ `server/.env` — Already contains real `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`

### Frontend (`client/`)
- ✅ `client/src/config.ts` — **NEW** Config file with `TEST_ORG_ID` and `API_BASE_URL`
- ✅ `client/src/hooks/useClientMetrics.ts` — Updated to use `API_BASE_URL` from config and `encodeURIComponent()` for org_id
- ✅ `client/src/Dashboard.tsx` — Updated to import `TEST_ORG_ID` from config instead of hardcoded id
- ✅ `client/src/main.tsx` — Already wired correctly

### Supporting Files
- ✅ `supabase/client_metrics_today.sql` — SQL to create the view in Supabase
- ✅ `.gitignore` — Excludes `.env` and `node_modules`
- ✅ `README.md` — Setup instructions

## How to Run

### Step 1: Set the Test Org ID

Edit `client/src/config.ts` and replace `<PUT_ORG_ID_HERE>` with a real org_id from your Supabase `client_metrics_today` view:

```ts
// Example:
export const TEST_ORG_ID = "123e4567-e89b-12d3-a456-426614174000";
```

### Step 2: Ensure Supabase View Exists

Run the SQL from `supabase/client_metrics_today.sql` in your Supabase SQL editor to create/update the view.

### Step 3: Start Backend

```powershell
cd server
npm run dev
```

Expected output:
```
[INFO] ...
Metrics API listening (configured host or port 4000)
```

### Step 4: Start Frontend

In a new terminal:

```powershell
cd client
npm run dev
```

Expected output:
```
VITE v5.x.x  ready in ... ms
     ➜  Local:   port 3001 (or visit https://dashboard.victorysync.com for deployed)
```

### Step 5: Open Dashboard

Visit the Vite dev URL (local port 3001) or the deployed dashboard at `https://dashboard.victorysync.com` in your browser.

**Expected Result:**
- ✅ Dashboard loads
- ✅ KPI card shows real metrics from Supabase for `TEST_ORG_ID`
- ✅ No HTTP 500 errors
- ✅ All 4 metrics display correctly (Answer rate, Avg wait, Total calls, Answered calls)

## Testing Data Updates

To verify live updates:

1. Insert a new call record into your Supabase `public.calls` table with today's date for the org_id.
2. The metrics view recalculates automatically.
3. Refresh the dashboard browser page—numbers should update within 15 seconds (auto-refresh interval).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (Vite Dev Server local)                    │
│  ┌────────────────────────────────────────────────┐ │
│  │  Dashboard.tsx                                 │ │
│  │  - imports TEST_ORG_ID from config.ts          │ │
│  │  - calls useClientMetrics(TEST_ORG_ID)         │ │
│  │  - renders KPI cards with real data            │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
              ↓ HTTP (fetch)
         API_BASE_URL + /api/client-metrics?org_id=...
              ↓
┌─────────────────────────────────────────────────────┐
│  Express Server (api.victorysync.com or local port 4000)                    │
│  ┌────────────────────────────────────────────────┐ │
│  │  GET /api/client-metrics?org_id=...            │ │
│  │  - queries Supabase client_metrics_today view  │ │
│  │  - returns { metrics: {...} }                  │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
              ↓ Supabase SDK
         SUPABASE_URL + service_role key
              ↓
┌─────────────────────────────────────────────────────┐
│  Supabase (Postgres)                                │
│  ┌────────────────────────────────────────────────┐ │
│  │  public.client_metrics_today (view)            │ │
│  │  - aggregates data from public.calls           │ │
│  │  - groups by org_id and day                    │ │
│  │  - returns real metrics                        │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Troubleshooting

### Dashboard shows "Loading metrics…" indefinitely
- Check browser console for fetch errors
- Verify `TEST_ORG_ID` in config.ts is correct
- Verify backend is running on port 4000

### Dashboard shows "Error: HTTP 400"
- Likely `TEST_ORG_ID` is missing or empty
- Edit `client/src/config.ts` and ensure `TEST_ORG_ID` is a valid UUID

### Dashboard shows "Error: HTTP 500"
- Backend failed to query Supabase
- Check backend console for "Supabase metrics error"
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in server/.env are correct
- Verify the `client_metrics_today` view exists in Supabase

### "Cannot find module" errors
- Run `npm install` in both `server/` and `client/` directories
- Clear any build caches: `rm -r dist node_modules` then `npm install`

## Next Steps

Once you see real metrics:

1. **Add live data**: Insert more call records to test the view
2. **Test auto-refresh**: Edit Supabase data and watch the dashboard update every 15 seconds
3. **Add authentication**: Replace `TEST_ORG_ID` with dynamic org selection (from user's memberships)
4. **Customize KPIs**: Adjust metrics, colors, or add new sections to the dashboard

---

**All files updated and ready to test!** 🚀
