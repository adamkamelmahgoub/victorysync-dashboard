# DEPLOYMENT CHECKLIST - RLS FIX

## Pre-Deployment (Verification)

- [ ] Check http://localhost:3000/debug-auth 
  - [ ] Auth User section populated ✅
  - [ ] org_users Query Result shows 1+ membership ✅
  - [ ] organizations Query Result currently empty (will be fixed)

## Deployment Steps

### Step 1: Open Supabase SQL Editor
- [ ] Go to your Supabase project dashboard
- [ ] Locate "SQL Editor" in the left sidebar
- [ ] Click "New query"

### Step 2: Paste the Fix
- [ ] Open `/SUPABASE_FIX.sql` from project root
- [ ] Copy entire file contents
- [ ] Paste into Supabase SQL Editor
- [ ] Verify no syntax errors (should be highlighted properly)

### Step 3: Execute
- [ ] Click "Run" button in Supabase
- [ ] Wait for "Query succeeded" message
- [ ] Verify both functions updated (is_org_member, is_org_admin)

### Step 4: Verify Fix Works
- [ ] Go to http://localhost:3000/debug-auth
- [ ] Refresh page (Ctrl+R or Cmd+R)
- [ ] Check "organizations Query Result" section
  - [ ] Should now show organization data (not empty!)
  - [ ] Should show org id, name, created_at

### Step 5: Test Dashboard
- [ ] Go to http://localhost:3000/dashboard
- [ ] Clear browser cache if needed (Ctrl+Shift+Del)
- [ ] Refresh dashboard (Ctrl+R)
- [ ] Should display organization content
  - [ ] Shows org name at top
  - [ ] Shows KPI tiles (calls, agents, etc)
  - [ ] Shows charts and metrics
  - [ ] NO "No organization is linked" error

## Post-Deployment (Final Verification)

- [ ] Test user login → org dashboard works
- [ ] Test org admin features (members tab, settings)
- [ ] Test multiple users in same org
- [ ] Check browser console for no [ORG] errors
- [ ] Debug page still accessible for future troubleshooting

## If Fix Doesn't Work

**Check 1:** Did the SQL execute successfully?
- [ ] Go to Supabase SQL Editor history
- [ ] Verify the two functions are listed

**Check 2:** Clear browser cache
- [ ] Press Ctrl+Shift+Del (Windows) or Cmd+Shift+Del (Mac)
- [ ] Select "Cached images and files"
- [ ] Click "Clear data"
- [ ] Refresh http://localhost:3000

**Check 3:** Verify user has org_users membership
- [ ] Go to Supabase SQL Editor
- [ ] Run: `SELECT * FROM public.org_users WHERE user_id = auth.uid();`
- [ ] Should return at least one row
- [ ] Check the org_id value

**Check 4:** Test RLS function directly
- [ ] Go to Supabase SQL Editor
- [ ] Replace 'YOUR_ORG_ID' with actual org_id from above
- [ ] Run: `SELECT public.is_org_member('YOUR_ORG_ID'::uuid) as result;`
- [ ] Should return TRUE
- [ ] If returns FALSE, check org_id is correct

## Success Criteria

✅ All boxes should be checked after deployment:
- [ ] RLS functions updated in Supabase
- [ ] Debug page shows organization data
- [ ] Dashboard loads without "No organization" error
- [ ] Org name and content display correctly
- [ ] No errors in browser console

## Files Reference

| File | Purpose |
|------|---------|
| SUPABASE_FIX.sql | The actual SQL to run - copy and paste this |
| QUICK_FIX.md | Fast deployment guide |
| BUG_ANALYSIS_COMPLETE.md | Technical explanation of bug |
| RLS_FIX_GUIDE.md | Detailed RLS policy explanation |
| SOLUTION_READY.md | Complete solution summary |

---

**Estimated Time:** 5 minutes setup + 2 minutes testing = 7 minutes total

**Risk Level:** Very Low (only changes RLS security functions, no data modification)
