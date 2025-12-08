# Quick Deployment Guide

## What Was Fixed

**Problem:** Production metrics endpoints returning HTTP 500 with "TypeError: fetch failed"

**Solution:** 
1. Refactored Supabase client to read env vars directly from `process.env` (not via import)
2. Added upfront validation at module load time (server startup fails immediately if vars missing)
3. Enhanced logging on all metrics endpoints to show request/processing/response details

---

## To Deploy to Production

### Step 1: Verify Vercel Environment Variables

Go to: **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**

Ensure these are set:
- ✅ `SUPABASE_URL` (from Supabase Dashboard → Project Settings → API)
- ✅ `SUPABASE_SERVICE_KEY` (from Supabase Dashboard → Project Settings → API → Service Role Key)
- ✅ `MIGHTYCALL_API_KEY`
- ✅ `MIGHTYCALL_USER_KEY`

### Step 2: Deploy
```bash
git add .
git commit -m "Fix production env var loading for Supabase"
git push origin main
# Vercel will automatically build and deploy
```

### Step 3: Verify
Once deployed, test endpoints:
```bash
# Should return valid JSON with metrics (not 500 error)
curl https://api.victorysync.com/api/client-metrics

# Should return recent calls
curl https://api.victorysync.com/api/calls/recent?limit=5

# Should return queue stats
curl https://api.victorysync.com/api/calls/queue-summary

# Should return time series
curl https://api.victorysync.com/api/calls/series?range=day
```

### Step 4: Monitor Logs
**Vercel Dashboard** → Your Project → **Deployments** → Latest → **Function Logs**

You should see logs like:
```
[client-metrics] Request: { orgId: undefined, ... }
[client-metrics] Returning global computed metrics: { totalCalls: 42, ... }
```

If you see errors, they will be clear like:
```
[supabaseClient] Missing environment variables: SUPABASE_SERVICE_KEY
```

---

## What Changed in Code

### File: `server/src/lib/supabaseClient.ts`
- Now reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` directly from `process.env`
- Validates env vars at module load time (server startup)
- If any vars are missing, server fails to start with clear error message
- Updated JSDoc with production requirements

### File: `server/src/index.ts`
- Enhanced logging on `/api/client-metrics` endpoint
- Enhanced logging on `/api/calls/recent` endpoint  
- Enhanced logging on `/api/calls/series` endpoint
- Enhanced logging on `/api/calls/queue-summary` endpoint
- All errors now include specific "detail" field with root cause

---

## If Production Endpoints Still Return Errors

### Error: "Supabase config failed: Missing SUPABASE_SERVICE_KEY"

**Fix:** Go to Vercel → Project Settings → Environment Variables → Add `SUPABASE_SERVICE_KEY`

### Error: "metrics_fetch_failed" with "permission denied"

**Fix:** Verify SUPABASE_SERVICE_KEY is the **Service Role Key** (not Anon Key)
- Supabase Dashboard → Project Settings → API
- Copy the value from "Service Role Key" (longer key, not the "Anon Public Key")

### Error: "metrics_fetch_failed" with "relation 'calls' does not exist"

**Fix:** Verify database has `calls` table
- Supabase Dashboard → SQL Editor → Check tables exist
- Run sync script to seed MightyCall data if needed

### No Error, But Dashboard Shows "Loading..."

**Fix:** 
1. Check browser console for errors (F12 → Console tab)
2. Check dashboard env var: `VITE_API_BASE_URL` should be set to `https://api.victorysync.com` in production
3. Verify frontend is deployed to `https://dashboard.victorysync.com`

---

## Production Checklist

- [ ] All env vars added to Vercel project settings (SUPABASE_URL, SUPABASE_SERVICE_KEY, MIGHTYCALL_*)
- [ ] Code pushed to main branch and deployed by Vercel
- [ ] Vercel function logs show no startup errors
- [ ] `/api/client-metrics` returns valid metrics JSON (not 500)
- [ ] Dashboard at `https://dashboard.victorysync.com` shows metrics (not error)
- [ ] Browser console shows no CORS or API errors

---

## Key Files Modified

```
server/src/
├── lib/
│   └── supabaseClient.ts          ← Refactored env var loading
└── index.ts                        ← Enhanced logging on 4 endpoints
```

---

## Questions?

Refer to:
1. `PRODUCTION_REFACTORING_SUMMARY.md` - Full technical summary
2. `REFACTORING_DETAILS.md` - Before/after code comparison
3. Vercel Function Logs - Real-time error diagnostics

---

## Timeline

- ✅ **Refactoring Complete:** Supabase client now validates env vars at startup
- ✅ **Local Testing:** All endpoints returning valid JSON
- ✅ **Build:** TypeScript compilation successful
- 📋 **Next:** Deploy to Vercel and verify production endpoints
