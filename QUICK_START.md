# Quick Start Guide - Running VictorySync Dashboard

## Prerequisites
- Node.js 18+ installed
- Supabase account with required tables created
- MightyCall API credentials in `.env`

## Step 1: Create Database Tables (First Time Only)

1. Go to [Supabase Dashboard](https://supabase.com/)
2. Open your project's SQL Editor
3. Create a new query and run each SQL file in order:

```sql
-- 1. Create Support Tickets tables
-- Copy contents from: server/CREATE_SUPPORT_TICKETS_TABLE.sql
-- Click "Run"

-- 2. Create MightyCall tables  
-- Copy contents from: server/CREATE_MIGHTYCALL_TABLES.sql
-- Click "Run"

-- 3. Create Billing tables
-- Copy contents from: server/CREATE_BILLING_TABLES.sql
-- Click "Run"
```

## Step 2: Start the API Server

**Option A: Using Node directly**
```powershell
cd server
npm install  # First time only
npm run build
node dist/index.js
```

**Option B: Using npm script**
```powershell
cd server
npm run start  # Runs: node dist/index.js
```

Expected output:
```
[startup] Starting Express server on port 4000...
[startup] *** ALL STARTUP CHECKS PASSED - Server is fully operational ***
```

## Step 3: Start the Client Dev Server

**In a NEW terminal window:**
```powershell
cd client
npm install  # First time only
npm run dev
```

Expected output:
```
VITE v5.x.x  ready in 123 ms

➜  Local:   http://localhost:3000/
```

## Step 4: Access the Dashboard

Open your browser and navigate to:
```
http://localhost:3000
```

## Verify Everything is Working

### API Endpoints Test
```powershell
# Test from PowerShell
$headers = @{"x-user-id" = "5a055f52-9ff8-49d3-9583-9903d5350c3e"}
Invoke-WebRequest -Uri "http://localhost:4000/api/admin/phone-numbers" -Headers $headers
```

Should return HTTP 200 with your phone numbers.

### Features to Test

1. **Sync Phone Numbers**
   - Click "Sync from MightyCall" button
   - Should show 4 synced numbers

2. **View Support Tickets**
   - Navigate to Support Tickets section
   - Should display any existing tickets

3. **Generate Reports**
   - Go to Reports section
   - View call history and statistics

4. **Manage Invoices**
   - Go to Billing section
   - Create and view invoices

5. **Assign Packages**
   - Navigate to Packages
   - Assign billing plans to organizations

## Troubleshooting

### Server won't start on port 4000
```powershell
# Check if port 4000 is already in use
netstat -ano | findstr :4000

# Kill the process using that port (replace PID with actual PID)
taskkill /PID <PID> /F

# Then try starting the server again
```

### Client shows "Cannot connect to API"
1. Make sure API server is running on port 4000
2. Check that x-user-id header is set correctly
3. Verify CORS is not blocking requests (should not be - CORS is enabled)

### Database table errors
1. Ensure all SQL migrations have been run in Supabase
2. Check that tables exist: SELECT * FROM support_tickets LIMIT 1;
3. Verify the organizations table has test data

### Node version issues
```powershell
# Check your Node version
node --version  # Should be v18.0.0 or higher

# If needed, update Node from nodejs.org
```

## Environment Variables

Ensure your `.env` file in the `server` directory has:
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
MIGHTYCALL_API_KEY=your_api_key
MIGHTYCALL_USER_KEY=your_user_key
```

## Common Commands

```powershell
# Development - with auto-reload
cd server && npm run dev

# Build for production
cd server && npm run build

# Production - run built code
cd server && node dist/index.js

# Check server is running
curl http://localhost:4000/api/health

# View server logs
Get-Content server-output.txt -Tail 50
```

## Stopping the Servers

**Press `Ctrl+C` in each terminal running the servers**

Or kill the processes:
```powershell
Get-Process node | Stop-Process
```

## Support

If you encounter issues:
1. Check the FEATURES_FIXED.md for detailed documentation
2. Review server logs in server-output.txt
3. Verify all database tables are created
4. Ensure MightyCall credentials are correct in .env

Happy coding! 🚀
