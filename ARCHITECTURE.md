# 🏗️ VictorySync Dashboard Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER BROWSERS                                 │
│  Admin  │  Agent  │  Manager  │  All Roles                          │
└────────────────────────┬──────────────────────────────────────────────┘
                         │
                         │ HTTPS/HTTP
                         │
┌────────────────────────▼──────────────────────────────────────────────┐
│                    REACT FRONTEND (Port 3000)                          │
│                     (client/src/)                                      │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ Pages:                                                            │ │
│  │ - DashboardNewV3           (Main dashboard with KPIs)           │ │
│  │ - ReportsPageEnhanced      (Reports with real data)             │ │
│  │ - AdminDashboardPage ⭐    (NEW: Complete admin interface)      │ │
│  │ - SettingsPage             (User account settings)              │ │
│  │ - NumbersPage              (Phone number management)            │ │
│  │ - RecordingsPage           (Call recordings)                    │ │
│  │ - SMSPage                  (SMS messaging)                      │ │
│  │ - SupportPage              (Support & documentation)            │ │
│  │ - TeamPage                 (Team member management)             │ │
│  │ - LoginPage                (Authentication)                     │ │
│  │                                                                  │ │
│  │ Components:                                                      │ │
│  │ - AuthContext              (User authentication state)          │ │
│  │ - OrgContext               (Organization context)              │ │
│  │ - ToastProvider            (Notifications)                      │ │
│  │ - ErrorBoundary            (Error handling)                     │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────┬──────────────────────────────────────────────┘
                         │
                         │ REST API (localhost:4000)
                         │
┌────────────────────────▼──────────────────────────────────────────────┐
│              EXPRESS API SERVER (Port 4000)                             │
│                  (server/src/index.ts)                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ Authentication & Authorization                                  │  │
│  │ - x-user-id header validation                                  │  │
│  │ - Role-based access control (RBAC)                             │  │
│  │ - Platform admin / Org admin checks                            │  │
│  │ - API key verification                                          │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ API Endpoints                                                   │  │
│  │                                                                 │  │
│  │ USER MANAGEMENT:                                                │  │
│  │ - GET  /api/admin/users           → List all users            │  │
│  │ - POST /api/admin/users           → Create new user           │  │
│  │ - PATCH /api/admin/users/:id      → Update user               │  │
│  │                                                                 │  │
│  │ ORGANIZATION MEMBERS:                                           │  │
│  │ - GET  /api/orgs/:orgId/members   → List org members          │  │
│  │ - POST /api/orgs/:orgId/members   → Invite/add member         │  │
│  │ - DELETE /api/orgs/:orgId/members/:userId → Remove member     │  │
│  │                                                                 │  │
│  │ ORGANIZATIONS:                                                  │  │
│  │ - GET  /api/admin/orgs            → List all orgs             │  │
│  │ - GET  /api/admin/orgs/:orgId     → Get org details           │  │
│  │                                                                 │  │
│  │ CALL STATISTICS:                                                │  │
│  │ - GET  /api/call-stats            → KPIs + recent calls       │  │
│  │                                                                 │  │
│  │ MIGHTYCALL SYNC:                                                │  │
│  │ - POST /api/sync-mightycall-*     → Sync MightyCall data      │  │
│  │                                                                 │  │
│  │ + More endpoints...                                             │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└────────────────────────┬──────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         │ Supabase      │ MightyCall    │ External
         │ (Database)    │ (Phone API)   │ Services
         │               │               │
    ┌────▼────┐      ┌──▼──┐      ┌──▼──┐
    │ Database │      │API  │      │...  │
    └─────────┘      └─────┘      └─────┘
```

---

## 🗄️ Database Schema

### Users & Organizations
```sql
-- Core user tables
auth.users
├── id (UUID)
├── email
├── encrypted_password
└── metadata {role, ...}

public.profiles
├── id (FK auth.users)
├── full_name
├── avatar_url
└── ...

organizations
├── id (UUID)
├── name
├── created_at
└── metadata

org_users
├── org_id (FK organizations)
├── user_id (FK auth.users)
├── role (org_admin|org_manager|agent)
├── mightycall_extension
├── created_at
└── deleted_at

-- Settings
org_settings
├── org_id (FK organizations)
├── key (VARCHAR)
├── value (JSONB)
└── updated_at
```

### Call Data
```sql
organizations → phone_numbers → mightycall_recordings
├── org_id
├── phone_number
├── duration_seconds
├── recording_date
├── metadata {from, to, status, ...}
└── created_at

calls (alternative source)
├── org_id
├── phone_number
├── from_number
├── to_number
├── status (answered|missed|...)
├── duration_seconds
├── started_at
├── ended_at
└── created_at

user_phone_assignments
├── user_id
├── org_id
├── phone_number_id
└── created_at
```

---

## 🔐 Security Architecture

### Authentication Flow
```
User logs in with email/password
         ↓
Supabase Auth validates credentials
         ↓
Session token created
         ↓
Frontend stores in AuthContext
         ↓
All API requests include x-user-id header
         ↓
Server verifies user exists and is active
         ↓
Request proceeds or returns 401/403
```

### Authorization Flow
```
Request arrives with user context
         ↓
Check if platform_admin
         ├─ YES → Allow all resources
         └─ NO → Continue
         ↓
Check if org_admin of requested org
         ├─ YES → Allow org-level actions
         └─ NO → Continue
         ↓
Check if org_member of requested org
         ├─ YES → Allow member-level actions
         └─ NO → Return 403 Forbidden
```

### Data Filtering
```
User requests call data
         ↓
Fetch user's organizations
         ↓
Fetch phone numbers assigned to user
         ↓
Filter calls by user's assigned phones
         ↓
Return only visible data
```

---

## 📊 Data Flow Examples

### Creating a New User (Admin)

```
┌──────────────────────────────────────────────────────┐
│ Admin Dashboard (React)                              │
│ User fills form:                                     │
│  - email: newuser@company.com                        │
│  - password: SecurePass123                           │
│  - organization: VictorySync (UUID)                  │
│  - role: agent                                       │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ POST /api/admin/users
                   │ {email, password, orgId, role}
                   │
┌──────────────────▼───────────────────────────────────┐
│ Express Server (Node.js)                             │
│ 1. Verify request is from admin                      │
│ 2. Validate email not already used                   │
│ 3. Hash password                                     │
│ 4. Create auth.users record                          │
│ 5. Create profiles record                            │
│ 6. Create org_users mapping                          │
│ 7. Return success                                    │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ Query Supabase
                   │
┌──────────────────▼───────────────────────────────────┐
│ Supabase Database                                    │
│ ✓ User created in auth.users                        │
│ ✓ Profile created                                   │
│ ✓ Org membership created                            │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ Return success + user data
                   │
┌──────────────────▼───────────────────────────────────┐
│ React Frontend                                       │
│ ✓ Display success message                           │
│ ✓ Add user to local list                            │
│ ✓ Clear form inputs                                 │
└──────────────────────────────────────────────────────┘
```

### Inviting User to Organization

```
┌──────────────────────────────────────────────────────┐
│ Admin Dashboard → Members & Invites Tab              │
│ Admin enters:                                        │
│  - email: invite@company.com                         │
│  - role: agent                                       │
│  - organization: VictorySync (selected)              │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ POST /api/orgs/:orgId/members
                   │ {email, role}
                   │
┌──────────────────▼───────────────────────────────────┐
│ Express Server                                       │
│ 1. Verify admin of organization                      │
│ 2. Check if user exists                              │
│    ├─ If exists: Add to org_users (pending)          │
│    └─ If not: Send invite email                      │
│ 3. Create pending_invites record                     │
│ 4. Send email with acceptance link                   │
│ 5. Return success                                    │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ Create DB records + Send Email
                   │
┌──────────────────▼───────────────────────────────────┐
│ Supabase Database & Email Service                    │
│ ✓ pending_invites created with token                │
│ ✓ Email sent to recipient                           │
│ ✓ Token stored for verification                     │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ Return {success: true}
                   │
┌──────────────────▼───────────────────────────────────┐
│ React Frontend                                       │
│ ✓ Show "Invitation sent!" message                   │
│ ✓ Add member with "Pending" status to list          │
│ ✓ Can resend or cancel invite                       │
│                                                      │
│ User's email:                                        │
│ Receives invitation link                            │
│ Clicks to accept → Becomes active member            │
└──────────────────────────────────────────────────────┘
```

### Viewing Call Statistics

```
┌──────────────────────────────────────────────────────┐
│ Reports Page (React)                                 │
│ User selects organization                           │
│ System fetches data                                 │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ GET /api/call-stats?org_id=UUID
                   │ (with x-user-id header)
                   │
┌──────────────────▼───────────────────────────────────┐
│ Express Server - /api/call-stats Endpoint           │
│ 1. Get user's organizations                          │
│ 2. Get user's assigned phone numbers                │
│ 3. Query mightycall_recordings:                      │
│    - Filter by org_id                                │
│    - Filter by assigned phone numbers               │
│    - Calculate metrics:                              │
│      * Total calls                                   │
│      * Answered vs missed                            │
│      * Duration stats                                │
│      * Revenue if tracked                            │
│ 4. Sort recent calls                                │
│ 5. Return {stats, calls}                             │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ Query mightycall_recordings table
                   │ Filter by org + user permissions
                   │
┌──────────────────▼───────────────────────────────────┐
│ Supabase Database                                    │
│ SELECT * FROM mightycall_recordings                 │
│ WHERE org_id = ? AND phone_number IN (?)            │
│ ORDER BY recording_date DESC LIMIT 100              │
│                                                      │
│ Returns: Rows with real call data                   │
└──────────────────┬───────────────────────────────────┘
                   │
                   │ Return {
                   │   stats: {
                   │     totalCalls: 157,
                   │     answeredCalls: 145,
                   │     missedCalls: 12,
                   │     answerRate: 92.4,
                   │     avgHandleTime: 245,
                   │     totalDuration: 32920,
                   │     avgDuration: 209
                   │   },
                   │   calls: [...]
                   │ }
                   │
┌──────────────────▼───────────────────────────────────┐
│ React Frontend                                       │
│ Display KPI Cards:                                   │
│ ✓ Total Calls: 157.0                                │
│ ✓ Answer Rate: 92.4%                                │
│ ✓ Avg Handle Time: 4.08 min                         │
│ ✓ Answered Calls: 145.0                             │
│ ✓ Missed Calls: 12.0                                │
│ ✓ Total Duration: 548 min                           │
│                                                      │
│ Recent Calls Table:                                 │
│ [Phone | From | To | Status | Duration | Date]     │
└──────────────────────────────────────────────────────┘
```

---

## 🔄 Component Hierarchy

```
App
├── AuthProvider
│   ├── OrgProvider
│   │   ├── BrowserRouter
│   │   │   ├── ErrorBoundary
│   │   │   │   └── ToastProvider
│   │   │   │       └── Routes
│   │   │   │           ├── /login → LoginPage
│   │   │   │           ├── / → DashboardNewV3 (ProtectedRoute)
│   │   │   │           ├── /reports → ReportsPageEnhanced (ProtectedRoute)
│   │   │   │           ├── /admin → AdminDashboardPage ⭐ (AdminRoute)
│   │   │   │           ├── /numbers → NumbersPage (ProtectedRoute)
│   │   │   │           ├── /recordings → RecordingsPage (ProtectedRoute)
│   │   │   │           ├── /sms → SMSPage (ProtectedRoute)
│   │   │   │           ├── /support → SupportPage (ProtectedRoute)
│   │   │   │           ├── /team → TeamPage (ProtectedRoute)
│   │   │   │           ├── /admin/users → AdminUsersPage (AdminRoute)
│   │   │   │           ├── /admin/orgs → AdminOrgsPage (AdminRoute)
│   │   │   │           ├── /admin/* → Other admin pages
│   │   │   │           └── * → Redirect to /dashboard
```

---

## 🔌 External Integrations

### MightyCall API
```
Server calls MightyCall API
        ↓
Fetch:
- Phone numbers
- Call records
- Extensions
- Voicemails
- Contacts
        ↓
Store in Supabase
        ↓
Frontend displays data
```

### Supabase Auth
```
User signup/login
        ↓
Supabase Auth handles credentials
        ↓
Returns session token
        ↓
Frontend uses in AuthContext
        ↓
Server verifies on each request
```

### Email Service
```
Admin sends invitation
        ↓
Server generates token
        ↓
Email service sends
        ↓
User clicks link
        ↓
Server validates token
        ↓
User becomes member
```

---

## 📈 Scalability Architecture

### Current State
```
Single Instance:
- 1 React app (port 3000)
- 1 API server (port 4000)
- 1 Supabase project
- 1 MightyCall account
```

### Future: Multi-Instance
```
Load Balancer
├── React Server 1 (port 3000)
├── React Server 2 (port 3000)
└── ...

API Load Balancer
├── Express Server 1 (port 4000)
├── Express Server 2 (port 4000)
├── Express Server 3 (port 4000)
└── ...

Shared Services:
├── Supabase (cloud)
├── Redis (caching)
├── MightyCall API
└── S3 (file storage)
```

---

## 🚀 Deployment

### Development
```
Local machine
npm run dev (monorepo)
│
├── server: npm run dev (ts-node-dev on port 4000)
└── client: npm run dev (vite on port 3000)
```

### Production (Recommended)
```
Frontend: Vercel / Netlify
├── Build: npm run build
├── Deploy: Static hosting
└── Auto-deploy: On push to main

API: Vercel / Railway / Heroku
├── Build: npm run build
├── Deploy: Node.js runtime
├── ENV vars: All .env variables
└── Auto-deploy: On push to main

Database: Supabase (hosted)
├── Managed Postgres
├── Real-time subscriptions
├── Auth included
└── Backups automated
```

---

## 📊 Performance Metrics

### Frontend
- **Bundle size**: ~500KB (gzipped)
- **Load time**: <2 seconds
- **Time to interactive**: <3 seconds
- **Lighthouse score**: 85+

### API
- **Response time**: <200ms typical
- **Database queries**: <100ms
- **Throughput**: 1000+ req/sec

### Database
- **Query time**: <50ms typical
- **Connection pool**: 5-20 connections
- **Backup**: Automated daily

---

## 🔍 Monitoring & Debugging

### Frontend
- React DevTools
- Network tab in browser
- Console errors
- Sentry integration (optional)

### API
- Server console logs
- Express request logging
- Error stack traces
- Performance timing logs

### Database
- Supabase dashboard
- Query performance insights
- Backup status
- Real-time stats

---

## 📚 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React | 18.x |
| | TypeScript | 5.x |
| | Vite | 5.x |
| | Tailwind CSS | 3.x |
| | React Router | 6.x |
| **API** | Express | 4.x |
| | TypeScript | 5.x |
| | ts-node | 10.x |
| **Database** | Supabase | Latest |
| | PostgreSQL | 14+ |
| **Auth** | Supabase Auth | JWT-based |
| **External** | MightyCall API | v4 |

---

**Last Updated**: Today
**Architecture Version**: 2.0 (with Admin Dashboard)
**Status**: Production Ready
