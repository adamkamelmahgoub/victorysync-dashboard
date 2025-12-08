# Production Issue Resolution Checklist

**Issue:** Dashboard metrics endpoints returning HTTP 500 with "TypeError: fetch failed"

**Root Cause:** Supabase client env vars not properly configured in Vercel production environment

---

## ✅ Code Fixes (COMPLETED)

### 1. Supabase Client Refactoring
- ✅ `server/src/lib/supabaseClient.ts` now reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` directly from `process.env`
- ✅ Validates env vars at **module load time** (server startup) instead of request time
- ✅ Throws clear error if vars missing: `"Supabase config failed: Missing SUPABASE_SERVICE_KEY"`
- ✅ Added detailed error logging showing which vars are present/missing

### 2. Metrics Endpoint Improvements
- ✅ `/api/client-metrics` - Enhanced logging at each step (request, view lookup, fallback computation, response)
- ✅ `/api/calls/recent` - Request logging and call count logging
- ✅ `/api/calls/series` - Bucketing and time-series aggregation logging
- ✅ `/api/calls/queue-summary` - Queue aggregation logging

### 3. Error Handling
- ✅ All endpoints return consistent error format: `{ error: "...", detail: "..." }`
- ✅ Errors include specific root cause (not cryptic "fetch failed")
- ✅ No bare 500 errors - all exceptions logged with full context

---

## 📋 Production Configuration Checklist

### BEFORE REDEPLOYING - Verify Environment Variables

**In Vercel Dashboard:**

1. Go to: **Your Project** → **Settings** → **Environment Variables**

2. Verify these variables are set (all **required**):
   - [ ] `SUPABASE_URL` = your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
   - [ ] `SUPABASE_SERVICE_KEY` = your Service Role Key (NOT Anon Key)
   - [ ] `MIGHTYCALL_API_KEY` = from MightyCall account
   - [ ] `MIGHTYCALL_USER_KEY` = from MightyCall account

3. **CRITICAL:** 
   - [ ] Use **Service Role Key** (longer key) - NOT Anon Key (shorter key)
   - [ ] Verify no empty strings or placeholder values
   - [ ] Verify URL is correct format: `https://xxxxx.supabase.co`

### Deploy Changes

1. Push to main:
   ```bash
   git push origin main
   ```
   
2. Vercel automatically deploys. Monitor the deployment:
   - [ ] Build completes successfully
   - [ ] No "Supabase config failed" errors in logs
   - [ ] Server starts without crashing

### Verify Deployment

1. **Check Vercel Function Logs:**
   - Vercel Dashboard → Your Project → **Deployments** → Latest
   - Click **Function Logs** tab
   - Look for one of these patterns:

   ✅ **Good (successful init):**
   ```
   [supabaseClient] All env vars set
   [client-metrics] Request: { orgId: undefined, ... }
   [client-metrics] Returning global computed metrics: ...
   ```

   ❌ **Bad (env var missing):**
   ```
   [supabaseClient] Missing environment variables: SUPABASE_SERVICE_KEY
   Error: Supabase config failed: Missing SUPABASE_SERVICE_KEY
   ```

2. **Test Endpoints:**
   ```bash
   # Should return valid JSON (not 500 error)
   curl https://api.victorysync.com/api/client-metrics
   
   # Expected response:
   # {"metrics": {"total_calls": 42, "answered_calls": 35, ...}}
   ```

3. **Test Dashboard:**
   - Open `https://dashboard.victorysync.com/dashboard`
   - [ ] Top metrics tiles show numbers (not "API error")
   - [ ] "Calls by hour" chart shows data (not "HTTP 500")
   - [ ] "Recent activity" shows call list (not "API error")
   - [ ] Admin › Orgs page loads org metrics (not "Failed to fetch")

---

## 🔍 Troubleshooting

### Issue: Endpoints still return "metrics_fetch_failed" with "TypeError: fetch failed"

**Cause:** Vercel deployment failed to start due to missing env vars

**Fix:**
1. Check Vercel function logs for: `[supabaseClient] Missing environment variables: ...`
2. Add missing env var to Vercel project settings
3. Redeploy: `git push origin main`

### Issue: Endpoints return 500 with database error (e.g., "connection refused")

**Cause:** Supabase env vars set, but wrong URL or key

**Fix:**
1. Verify `SUPABASE_URL` is correct format: `https://xxxxx.supabase.co` (not `http://` or missing `.supabase.co`)
2. Verify `SUPABASE_SERVICE_KEY` is the **Service Role Key** (longer key from Supabase Dashboard → Settings → API)
3. If using Anon Key instead, you'll get permission errors
4. Update in Vercel and redeploy

### Issue: Dashboard shows metrics but they're all zeros

**Cause:** Supabase connection works but no call data in database

**Fix:**
1. Verify calls table has data: `https://app.supabase.com` → Your Project → SQL Editor → SELECT * FROM calls LIMIT 1
2. If no data, run sync script: `cd server; npm run sync:numbers`
3. Then check endpoints again

### Issue: Some orgs show metrics, others show zeros

**Cause:** Expected behavior - orgs without assigned phone numbers won't have call data

**Fix:**
1. Assign phone numbers to org: `/api/admin/orgs/{orgId}/phone-numbers`
2. Run sync: `npm run sync:numbers` to fetch latest calls
3. Endpoint will then show metrics for that org

---

## 📊 Expected Results After Fix

### What Should Work ✅

| Component | Before Fix | After Fix |
|-----------|-----------|-----------|
| Dashboard loads | ✅ | ✅ |
| Top metrics tiles | ❌ "API error" | ✅ "42 calls, 85% answer rate" |
| "Calls by hour" chart | ❌ "HTTP 500" | ✅ Shows hourly call volume |
| "Recent activity" list | ❌ "API error" | ✅ Shows 50 recent calls |
| Admin › Orgs page | ❌ "Failed to fetch" | ✅ Shows org metrics |
| `/api/client-metrics` | ❌ HTTP 500 | ✅ HTTP 200 with metrics JSON |
| `/api/calls/recent` | ❌ HTTP 500 | ✅ HTTP 200 with call list |
| `/api/calls/series` | ❌ HTTP 500 | ✅ HTTP 200 with time buckets |
| `/api/calls/queue-summary` | ❌ HTTP 500 | ✅ HTTP 200 with queue stats |

---

## 🚀 Deployment Timeline

| Step | Timeline | Status |
|------|----------|--------|
| Code refactoring | ✅ Complete | Done Dec 8, 2025 |
| TypeScript build | ✅ Complete | Exit code 0 |
| Git commit | ✅ Complete | Commit 0d0c8ed |
| Git push to main | ✅ Complete | Deployed to Vercel |
| Vercel build | ⏳ In progress | Monitor dashboard |
| Verify env vars | 📋 **YOU ARE HERE** | Set in Vercel settings |
| Test endpoints | ⏳ Next | Run curl tests |
| Test dashboard | ⏳ Next | Open in browser |

---

## 📝 Summary

**What was fixed:**
1. Supabase client now reads env vars directly from `process.env` (Vercel-compatible)
2. Env var validation happens at startup (not request time)
3. Clear error messages indicate which env vars are missing
4. All metrics endpoints have enhanced logging for diagnostics

**What you need to do:**
1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in Vercel project settings
2. Ensure using **Service Role Key** (not Anon Key)
3. Redeploy: `git push origin main`
4. Check Vercel function logs to verify deployment succeeded
5. Test endpoints and dashboard to confirm metrics are showing

**Expected result:**
- Dashboard metrics load without errors
- All API endpoints return valid JSON
- Vercel function logs show clear diagnostic messages if anything fails
