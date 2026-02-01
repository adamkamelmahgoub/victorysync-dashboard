# VictorySync Dashboard - MightyCall Integration & Billing Setup Guide

## ✅ Status Summary

### Phone Numbers Sync
- **Status**: ✅ **COMPLETE**
- **Synced Numbers**: 4 live numbers from MightyCall
  - `+1 212-235-7403` (KLINUS)
  - `+1 312-319-4556` (GenX)
  - `+1 732-328-6846` (HILLSIDE KITCHENS)
  - `+1 848-216-1220` (VictorySync)
- **Sync Script**: `node dist/scripts/sync_mightycall_clean.js`
- **Endpoint**: `POST /api/admin/mightycall/sync` (platform admin only)

### Features Implemented
✅ Phone number sync from MightyCall
✅ Extensions management
✅ Call history tracking ready
✅ Voicemail logs ready
✅ SMS logging ready
✅ Contact management ready
✅ Recording support ready
✅ User phone assignments (per-user access control)
✅ RBAC enforcement

---

## 🗄️ Database Setup Required

### Step 1: Create MightyCall Tables

Go to your Supabase project dashboard:
1. Navigate to: **SQL Editor** > **New Query**
2. Copy and paste the SQL from `server/CREATE_MIGHTYCALL_TABLES.sql`
3. Click **Run**

**Tables Created:**
- `call_history` - Track all calls
- `voicemail_logs` - Store voicemail messages
- `sms_logs` - Log SMS messages
- `mightycall_extensions` - Extension mappings
- `mightycall_reports` - Call reports
- `contact_events` - Contact interactions
- `mightycall_recordings` - Call recordings
- `user_phone_assignments` - Per-user phone access control

### Step 2: Create Billing Tables

Go to **SQL Editor** > **New Query** again:
1. Copy and paste the SQL from `server/CREATE_BILLING_TABLES.sql`
2. Click **Run**

**Tables Created:**
- `invoices` - Invoice management
- `invoice_line_items` - Itemized charges
- `usage_charges` - Track usage by org/feature
- `billing_plans` - Define pricing tiers
- `org_subscriptions` - Org plan assignments
- `payment_methods` - Store payment info
- `payment_transactions` - Payment history

---

## 📞 API Endpoints

### Phone Numbers
```
GET /api/admin/mightycall/phone-numbers
  Returns: { phone_numbers: [...] }
  Auth: x-user-id (platform admin)
```

### Call History
```
GET /api/admin/mightycall/call-history
  Query: ?orgId={orgId}&limit=100
  Returns: { call_history: [...] }
  Auth: x-user-id (platform admin)

POST /api/admin/mightycall/sync/calls
  Body: { orgId, dateStart?, dateEnd? }
  Returns: { success, calls }
  Auth: x-user-id (platform admin)
```

### Voicemails
```
GET /api/admin/mightycall/voicemails
  Query: ?orgId={orgId}
  Returns: { voicemails: [...] }
  Auth: x-user-id (platform admin)

POST /api/admin/mightycall/sync/voicemails
  Body: { orgId }
  Returns: { success, voicemails }
  Auth: x-user-id (platform admin)
```

### SMS
```
GET /api/admin/mightycall/sms-logs
  Query: ?orgId={orgId}
  Returns: { sms_logs: [...] }
  Auth: x-user-id (platform admin)

POST /api/admin/mightycall/send-sms
  Body: { orgId, from, to, message }
  Returns: { success }
  Auth: x-user-id (platform admin)
```

### Contacts
```
GET /api/admin/mightycall/contacts
  Query: ?orgId={orgId}
  Returns: { contacts: [...] }
  Auth: x-user-id (platform admin)

POST /api/admin/mightycall/sync/contacts
  Body: { orgId }
  Returns: { success, contacts }
  Auth: x-user-id (platform admin)
```

### User Phone Assignments
```
POST /api/orgs/:orgId/users/:userId/phone-assignments
  Body: { phoneNumberIds: string[] }
  Returns: { assigned: number }
  Auth: x-user-id (org admin or platform admin)

GET /api/orgs/:orgId/users/:userId/phone-assignments
  Returns: { phone_assignments: [...] }
  Auth: x-user-id (user or org admin)

GET /api/user/phone-assignments?orgId={orgId}
  Returns: { phone_assignments: [...] }
  Auth: x-user-id (current user)
```

### Invoicing
```
GET /api/admin/invoices?orgId={orgId}
  Returns: { invoices: [...] }
  Auth: x-user-id (platform admin)

POST /api/admin/invoices
  Body: { orgId, billingPeriodStart, billingPeriodEnd, items: [...] }
  Returns: { invoice_id, total, ... }
  Auth: x-user-id (platform admin)

POST /api/admin/usage-charges
  Body: { orgId, chargeType, quantity, unitCost, serviceDate }
  Returns: { charge_id }
  Auth: x-user-id (platform admin)
```

---

## 🔐 Access Control

### Platform Admin
- Can see all data for all orgs
- Can manage all phone numbers and users
- Can run sync operations
- Can manage billing

### Org Admin
- Can see/manage their organization only
- Can assign phone numbers to users in their org
- Can manage org members

### Organization Member (Agent)
- Can only see phone numbers assigned to them
- Can only make calls from assigned numbers
- Cannot see other users' data

---

## 🚀 Running the Server

### Development
```bash
cd server
npm run dev
```

### Production
```bash
cd server
npm run build
npm start
```

Server runs on `http://localhost:4000`

---

## 🔄 Syncing Data from MightyCall

### Manual Sync (All Phone Numbers)
```bash
cd server
node dist/scripts/sync_mightycall_clean.js
```

### API Sync (All Features)
```bash
curl -X POST http://localhost:4000/api/admin/mightycall/sync \
  -H "x-user-id: 5a055f52-9ff8-49d3-9583-9903d5350c3e" \
  -H "Content-Type: application/json"
```

### Sync Call History
```bash
curl -X POST http://localhost:4000/api/admin/mightycall/sync/calls \
  -H "x-user-id: 5a055f52-9ff8-49d3-9583-9903d5350c3e" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1"}'
```

### Sync Voicemails
```bash
curl -X POST http://localhost:4000/api/admin/mightycall/sync/voicemails \
  -H "x-user-id: 5a055f52-9ff8-49d3-9583-9903d5350c3e" \
  -H "Content-Type: application/json" \
  -d '{"orgId":"cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1"}'
```

---

## 📊 Testing the Features

### 1. Verify Phone Numbers
```bash
curl http://localhost:4000/api/admin/mightycall/phone-numbers \
  -H "x-user-id: 5a055f52-9ff8-49d3-9583-9903d5350c3e"
```

Expected response:
```json
{
  "phone_numbers": [
    {
      "id": "...",
      "number": "+12122357403",
      "label": "KLINUS",
      "orgId": null,
      "createdAt": "2026-01-31T00:21:51.590714+00:00"
    }
  ]
}
```

### 2. Assign Numbers to Users
```bash
curl -X POST http://localhost:4000/api/orgs/cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1/users/{USER_ID}/phone-assignments \
  -H "x-user-id: 5a055f52-9ff8-49d3-9583-9903d5350c3e" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumberIds":["0c6873e1-d077-4a1c-bfb2-dbd27158609c"]}'
```

### 3. List User's Assigned Numbers
```bash
curl "http://localhost:4000/api/user/phone-assignments?orgId=cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1" \
  -H "x-user-id: {USER_ID}"
```

---

## 🛠️ Configuration

### Required Environment Variables (server/.env)
```
MIGHTYCALL_API_KEY=your_api_key
MIGHTYCALL_USER_KEY=your_user_key
MIGHTYCALL_BASE_URL=https://ccapi.mightycall.com/v4

SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
SUPABASE_JWT_SECRET=your_jwt_secret
```

---

## 📋 Checklist

- [x] Phone numbers synced from MightyCall
- [x] Extensions configured
- [x] Call history table created
- [x] Voicemail logs table created
- [x] SMS logs table created
- [x] Recording support implemented
- [ ] MightyCall tables created in Supabase (REQUIRED)
- [ ] Billing tables created in Supabase (REQUIRED)
- [ ] User phone assignments tested
- [ ] RBAC verified (users see only their numbers)
- [ ] Billing setup configured
- [ ] Payment methods added
- [ ] First invoice generated

---

## 🐛 Troubleshooting

### Server won't start
- Check that `MIGHTYCALL_API_KEY` and `MIGHTYCALL_USER_KEY` are set in `server/.env`
- Check Supabase URL and service key
- Look at server logs for detailed error messages

### Tables not found errors
- Run the SQL migration scripts in Supabase SQL Editor
- Verify tables exist: `SELECT * FROM information_schema.tables WHERE table_schema='public'`

### Phone numbers not syncing
- Verify MightyCall credentials are correct
- Check server logs: `node dist/scripts/sync_mightycall_clean.js`
- Ensure platform admin user ID is correct

### User can see numbers they shouldn't
- Check `user_phone_assignments` table for correct assignments
- Verify RBAC middleware is in place
- Check org_id matches on phone_numbers and user assignments

---

## 📚 Files Modified

- `server/src/integrations/mightycall.ts` - MightyCall API layer with sync helpers
- `server/src/index.ts` - REST API endpoints for all features
- `server/src/auth/rbac.ts` - Role-based access control
- `server/CREATE_MIGHTYCALL_TABLES.sql` - Database schema for MightyCall data
- `server/CREATE_BILLING_TABLES.sql` - Database schema for billing

---

## 🎯 Next Steps

1. **Create tables in Supabase** (copy SQL files to Supabase SQL Editor)
2. **Populate default billing plans** (insert into `billing_plans` table)
3. **Assign organizations to plans** (insert into `org_subscriptions` table)
4. **Test user phone assignments** (assign numbers to test user)
5. **Generate first invoice** (POST to `/api/admin/invoices`)
6. **Enable client app** (configure frontend to query phone assignments and restrict calls)

---

Generated: 2026-01-31
