# VictorySync Dashboard — 5-Minute Quick Start

**Get the app running locally in 5 minutes!**

---

## Prerequisites (Install First)

- Node.js 18+ (https://nodejs.org)
- Git (https://git-scm.com)
- Supabase account (free at https://supabase.com)

---

## Step 1: Create Supabase Project (2 minutes)

1. Go to https://supabase.com
2. Click **"New Project"**
3. Choose a region (pick closest to you)
4. Click **"Create Project"** (wait 2-3 minutes)
5. Once ready, click **"Settings"** (bottom left)
6. Click **"API"** tab
7. Copy:
   - **Project URL** → Save as `SUPABASE_URL`
   - **Anon Key** → Save as `SUPABASE_ANON_KEY`
   - **Service Role Key** → Save as `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2: Clone & Install (2 minutes)

```bash
# Clone repository
git clone https://github.com/yourusername/victorysync-dashboard.git
cd victorysync-dashboard

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Back to root
cd ..
```

---

## Step 3: Configure Environment (1 minute)

### Server Configuration
```bash
cd server
cp .env.example .env
```

Edit `server/.env`:
```env
NODE_ENV=development
PORT=4000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SERVICE_KEY=test-secret-key-12345
```

### Client Configuration
```bash
cd ../client
cp .env.example .env.local
```

Edit `client/.env.local`:
```env
VITE_API_BASE_URL=http://localhost:4000
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## Step 4: Apply Database Migration (Included)

```bash
# From project root
npx supabase link --project-ref your-project-ref
npx supabase db push
```

This creates all tables, RLS policies, and seeds demo data. ✅

---

## Step 5: Start Services (Run in 2 Terminal Windows)

### Terminal 1: Backend
```bash
cd server
npm run dev
```

You should see:
```
Server running on http://localhost:4000
Database connected ✓
```

### Terminal 2: Frontend
```bash
cd client
npm run dev
```

You should see:
```
VITE v4.x.x
Ready in 500ms
➜  Local: http://localhost:5173
```

---

## Step 6: Open App

Open **http://localhost:5173** in your browser

---

## Step 7: Create Account & Test

1. Click **"Sign Up"**
2. Enter email and password
3. Confirm email (may go to spam folder)
4. Log in
5. Click **"Create Organization"**
6. Enter organization name (e.g., "Test Corp")
7. Click **"Create"**

✅ **Dashboard should load with KPI tiles**

---

## Quick Tests

### Test Dashboard
- [ ] See KPI tiles (Calls Today, SMS, etc.)
- [ ] See charts (Calls Over Time, Queue Status)
- [ ] See activity feed

### Test Org Switcher
- [ ] See org name in header
- [ ] No more org dropdown (unless you create second org)

### Test Phone Numbers
- [ ] Click "Numbers" in sidebar
- [ ] Should be empty (no numbers synced yet)

### Test MightyCall Integration (Admin Only)
- [ ] Click "Admin" → "Integrations"
- [ ] Enter test MightyCall credentials:
  - API Key: `test-api-key-12345`
  - User Key: `test-user-key-67890`
  - Base URL: `https://api.mightycall.com`
- [ ] Click "Save Integration"
- [ ] Should see success message

---

## Next Steps

### Run Tests
```bash
# In project root
node scripts/smoke-test.js      # Test all API endpoints
node scripts/verify-rls.js      # Test RLS security
```

### View Documentation
- **Start:** [COMPLETE_README.md](./COMPLETE_README.md)
- **API:** [API_REFERENCE.md](./API_REFERENCE.md)
- **Deploy:** [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md)

### For Development
- [DEVELOPER_QUICK_REFERENCE.md](./DEVELOPER_QUICK_REFERENCE.md)

### For Testing
- [COMPLETE_TESTING_GUIDE.md](./COMPLETE_TESTING_GUIDE.md)

---

## Common Issues & Solutions

### "Cannot connect to database"
- Check `SUPABASE_URL` and keys are correct
- Verify project is active in Supabase dashboard

### "Port 4000 already in use"
```bash
# Kill existing process
lsof -ti:4000 | xargs kill -9
# Then restart
```

### "Vite can't resolve module"
```bash
# Clear cache and reinstall
cd client
rm -rf node_modules package-lock.json
npm install
```

### "Page shows 'Organization not found'"
- Log out completely
- Clear browser cache
- Log back in
- Click "Create Organization"

### "MightyCall credentials not saving"
- Verify you're logged in as org admin
- Check browser console for errors
- Verify SUPABASE_SERVICE_ROLE_KEY is correct

---

## How to Stop Services

```bash
# Terminal 1 & 2: Press Ctrl+C
```

---

## Next Time You Run

```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend
cd client && npm run dev

# Open http://localhost:5173
```

---

## Want to Deploy to Production?

→ See [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md)

---

## Need Help?

1. **Check docs:** [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)
2. **See API examples:** [API_REFERENCE.md](./API_REFERENCE.md)
3. **Review code:** [DEVELOPER_QUICK_REFERENCE.md](./DEVELOPER_QUICK_REFERENCE.md)
4. **Test issues:** [COMPLETE_TESTING_GUIDE.md](./COMPLETE_TESTING_GUIDE.md#troubleshooting)

---

**That's it! You're all set. Happy coding! 🚀**

---

**Questions?** Check [COMPLETE_README.md](./COMPLETE_README.md#support)
