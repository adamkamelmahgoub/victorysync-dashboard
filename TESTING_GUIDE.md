# Quick Start: Testing the Multi-Tenant Admin Panel

## Prerequisites

1. Backend running: `cd server && npm run dev` (port 4000)
2. Frontend running: `cd client && npm run dev` (port 3000)
3. Supabase project with valid credentials in `.env`

## Step-by-Step Testing

### Phase 1: Database Setup (5 minutes)

1. **Open Supabase SQL Editor**
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor

2. **Run Setup Script**
   - Copy entire contents of `supabase/setup_org_scoping.sql`
   - Paste into SQL editor
   - Click "Run"
   - Wait for completion (should complete without errors)

3. **Verify Tables**
   - In Supabase sidebar, expand Tables
   - You should see:
     - `organizations`
     - `org_users`
     - `org_phone_numbers`
     - `org_settings`
     - `calls` (already existed)

### Phase 2: Create Admin User (5 minutes)

1. **Create auth user with admin role**
   - In Supabase Auth section, click "Create new user"
   - Email: `admin@example.com`
   - Password: `AdminPass123!`
   - Click "Create user"

2. **Add admin role to user**
   - Click on the user in the list
   - Edit "User metadata"
   - Paste:
     ```json
     {
       "role": "admin"
     }
     ```
   - Save

3. **Create test organization user** (optional)
   - Email: `testuser@example.com`
   - Password: `TestPass123!`
   - Metadata:
     ```json
     {
       "role": "agent"
     }
     ```

### Phase 3: Test Admin Panel (10 minutes)

1. **Login as Admin**
   - Open https://dashboard.victorysync.com (deployed) or your local dev host (port 3000)
   - Enter: `admin@example.com` / `AdminPass123!`
   - Click Dashboard link in navbar

2. **Visit Admin Users Page**
   - Click "Users" link in navbar
   - Should load with "Create New User" form on left
   - Should show "All Users" and "Agents" tabs on right

3. **Test: Create New User**
   - Fill form:
     - Email: `agent1@example.com`
     - Password: `Agent123Pass!`
     - Organization: (select or message "No orgs yet")
     - Role: `agent`
   - Click "Create User"
   - Should see success message
   - User should appear in the assignments table

4. **Visit Admin Orgs Page**
   - Click "Orgs" link in navbar
   - Should load with "Create Organization" form on left

5. **Test: Create Organization**
   - Fill form:
     - Name: `Test Corp`
   - Click "Create Organization"
   - Should see success message
   - Org should appear in right panel as clickable card

6. **Test: View Org Details**
   - Click on organization card
   - Modal should slide up showing:
     - Organization name at top
     - Call stats (may be 0 initially)
     - Members section (may be empty)
     - Phone Numbers section (may be empty)
   - Click X to close

7. **Test: Create User for Org**
   - Go back to Users page
   - Create new user:
     - Email: `agent2@example.com`
     - Password: `Agent2Pass!`
     - Organization: `Test Corp` (select from dropdown)
     - Role: `agent`
   - Click "Create User"
   - View org details again - agent2 should appear in Members list

8. **Test: Switch Tabs**
   - In Users page right panel, click "Agents" tab
   - Should show filtered list of only users with agent role
   - Should include agent1 and agent2

### Phase 4: Data Scoping Test (10 minutes)

1. **Create non-admin user**
   - In Supabase Auth, create:
     - Email: `testuser@example.com`
     - Password: `TestPass123!`
     - Metadata: `{ "role": "agent", "org_id": "..."}`
     - (Replace org_id with the UUID of "Test Corp")

2. **Create test call data**
   - In Supabase SQL Editor, run:
     ```sql
     insert into public.calls (org_id, direction, from_number, to_number, status, started_at)
     values 
       ('<TEST_CORP_UUID>', 'inbound', '+15550000001', '+15550000002', 'answered', now()),
       ('<TEST_CORP_UUID>', 'inbound', '+15550000001', '+15550000002', 'answered', now() - interval '5 minutes');
     ```
   - Replace `<TEST_CORP_UUID>` with actual org UUID from Test Corp

3. **Login as regular user**
   - Logout from admin account
   - Login as: `testuser@example.com` / `TestPass123!`
   - Should redirect to Dashboard

4. **Verify Data Scoping**
   - Dashboard should show metrics for their org only
   - All metrics should be calculated from only their org's calls
   - Recent activity list should show only their org's calls
   - If you have 2 test calls, should see 2 calls in recent activity

5. **Test Data Separation**
   - Create another org and user (via admin panel)
   - Add different calls to that org
   - Login as regular user for first org
   - Verify they only see calls from their org, not the other org

### Phase 5: Verify No Errors (5 minutes)

1. **Check Browser Console**
   - Open DevTools (F12)
   - Go to Console tab
   - Should see no red errors
   - May see some warnings (normal)

2. **Check Backend Logs**
   - Look at terminal running `npm run dev` for server
   - Should see requests but no 500 errors
   - May see some 404s if hitting unused endpoints (fine)

3. **Check for Compilation Errors**
   - Run: `cd client && npm run build`
   - Should complete successfully with no TS errors
   - Run: `cd server && npm run build`
   - Should complete successfully with no TS errors

## Key Test Scenarios

### ✅ Success Cases

- [ ] Create org as admin
- [ ] Create user as admin
- [ ] Assign user to org
- [ ] View org details with members
- [ ] Filter users by role (All vs Agents)
- [ ] See call stats in org details
- [ ] Login as non-admin user
- [ ] See only own org's data on dashboard
- [ ] See only own org's calls in recent activity

### ❌ Error Cases (Should Handle Gracefully)

- [ ] Create user with empty fields (shows "All fields are required")
- [ ] Create user with duplicate email (shows backend error)
- [ ] Create org with empty name (shows "Name is required")
- [ ] Edit user role inline
- [ ] Delete user assignment
- [ ] Close and reopen org details modal

## Expected Final State

After all tests pass:
- ✅ 3+ users created
- ✅ 2+ organizations created
- ✅ Users assigned to orgs
- ✅ Org details modal working
- ✅ Call stats displaying
- ✅ Data scoping verified
- ✅ No TypeScript errors
- ✅ No console errors
- ✅ All tabs working

## Troubleshooting

**Problem**: "No organizations found" when creating user
- **Solution**: Create organization first via `/admin/orgs`, then create user

**Problem**: User doesn't appear in assignments table
- **Solution**: Refresh page; check browser console for errors

**Problem**: Org details modal doesn't show call stats
- **Solution**: Insert test call data using SQL (see Phase 4 step 2)

**Problem**: RLS policy errors in console
- **Solution**: Verify RLS policies created by running `setup_org_scoping.sql` again

**Problem**: Backend returns 500 error
- **Solution**: Check server logs for specific error; ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are set

## Performance Notes

- AdminUsersPage loads 3 sets of data in parallel: orgs, auth users, org_users
- AdminOrgsPage opens org details modal which loads members, phones, and stats concurrently
- All requests have proper loading states and error handling
- No waterfalls or sequential loading delays

---

**All tests passing? 🎉 The multi-tenant admin panel is ready for production!**
