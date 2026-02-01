# VictorySync Dashboard — Developer Quick Reference

## Getting Started

### Local Development Setup

1. **Clone & Install**
   ```bash
   git clone <repo>
   cd victorysync-dashboard
   
   # Server
   cd server
   npm install
   cp .env.example .env
   # Edit .env with Supabase credentials
   
   # Client
   cd ../client
   npm install
   cp .env.example .env.local
   # Edit .env.local with Supabase URL/Anon Key
   ```

2. **Run Services**
   ```bash
   # Terminal 1: Server
   cd server
   npm run dev
   
   # Terminal 2: Client
   cd client
   npm run dev
   
   # Browser: http://localhost:5173
   ```

3. **Apply Database Migration**
   ```bash
   npx supabase db push
   ```

## Key Files Overview

### Frontend

| File | Purpose | Key Exports |
|------|---------|-------------|
| `client/src/main.tsx` | App entry & routing | Routes, pages, admin guards |
| `client/src/contexts/AuthContext.tsx` | Global auth state | useAuth(), orgs, selectedOrgId |
| `client/src/lib/apiClient.ts` | API request helpers | fetchJson(), MightyCall helpers, integrations helpers |
| `client/src/lib/phonesApi.ts` | Phone number API | getOrgPhoneNumbers(), assignPhoneNumber() |
| `client/src/pages/Dashboard.tsx` | Main dashboard | Metrics, charts, activity feed |
| `client/src/pages/NumbersPage.tsx` | Phone management | List, sync, assign/unassign |
| `client/src/pages/admin/AdminMightyCallPage.tsx` | Integration setup | Save/delete MightyCall credentials |
| `client/src/components/AdminTopNav.tsx` | Admin navbar | Org switcher, nav links |

### Backend

| File | Purpose | Key Routes |
|------|---------|-----------|
| `server/src/index.ts` | Express app & routes | All API endpoints listed below |
| `server/src/middleware.ts` | Auth, logging, errors | apiKeyAuth, serviceKeyAuth, requestLogging |
| `server/src/utils/mightycall.ts` | MightyCall client | syncPhoneNumbers(), syncReports() |
| `server/src/utils/integrations.ts` | Integration helpers | getEncrypted(), setEncrypted() |

### Database

| File | Purpose | Key Objects |
|------|---------|------------|
| `supabase/migrations/000_full_migration.sql` | Full schema + RLS + seeds | Tables, policies, functions |

## Common Tasks

### Add a New API Endpoint

**Server-side (`server/src/index.ts`):**
```typescript
// Add route handler
app.get('/api/orgs/:orgId/new-feature', async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.headers['x-user-id'];
  
  // 1. Validate role
  const role = await getOrgRole(userId, orgId);
  if (!role) return res.status(403).json({ error: 'Not a member' });
  
  // 2. Query data
  const data = await supabase
    .from('table_name')
    .select('*')
    .eq('org_id', orgId);
  
  // 3. Return response
  res.json(data);
});
```

**Client-side (`client/src/lib/apiClient.ts`):**
```typescript
export async function getNewFeature(orgId: string) {
  return fetchJson(`/api/orgs/${orgId}/new-feature`);
}
```

**Use in Component (`client/src/pages/SomePage.tsx`):**
```typescript
import { getNewFeature } from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

export function SomePage() {
  const { selectedOrgId } = useAuth();
  const [data, setData] = useState(null);
  
  useEffect(() => {
    if (selectedOrgId) {
      getNewFeature(selectedOrgId).then(setData);
    }
  }, [selectedOrgId]);
  
  return <div>{data && <pre>{JSON.stringify(data, null, 2)}</pre>}</div>;
}
```

### Add a New Admin Page

**Create page file (`client/src/pages/admin/AdminNewPage.tsx`):**
```typescript
import { useAuth } from '../../contexts/AuthContext';
import { AdminRoute } from '../../components/AdminRoute';

export function AdminNewPage() {
  const { user, selectedOrgId } = useAuth();
  
  return (
    <AdminRoute>
      <div className="p-8">
        <h1>New Admin Feature</h1>
        <p>Org: {selectedOrgId || 'All'}</p>
      </div>
    </AdminRoute>
  );
}
```

**Add route (`client/src/main.tsx`):**
```typescript
import { AdminNewPage } from './pages/admin/AdminNewPage';

const routes = [
  // ... existing routes
  { path: '/admin/new-feature', element: <AdminNewPage /> },
];
```

**Add nav link (`client/src/components/AdminTopNav.tsx`):**
```tsx
<NavLink to="/admin/new-feature" className={({ isActive }) => isActive ? 'active' : ''}>
  New Feature
</NavLink>
```

### Modify Org Integrations

**Update integration (`client/src/pages/admin/AdminMightyCallPage.tsx`):**
```typescript
const handleSaveIntegration = async () => {
  // This page already handles MightyCall; to add another integration type:
  // 1. Add new form field
  // 2. Collect credentials
  // 3. Call saveOrgIntegration('integration_type', orgId, credentials)
};
```

## Common Queries

### User's Organizations
```typescript
const { orgs, selectedOrgId, setSelectedOrgId } = useAuth();

// All orgs for current user
console.log(orgs); // [{ id, name }, ...]

// Current selection
console.log(selectedOrgId);

// Change selection
setSelectedOrgId(orgs[0].id);
```

### Org Members
```sql
SELECT om.*, p.email, p.full_name
FROM org_members om
JOIN profiles p ON om.user_id = p.id
WHERE om.org_id = '<org-id>'
ORDER BY p.email;
```

### Check if User is Org Admin
```typescript
const role = await getOrgRole(userId, orgId);
const isAdmin = role === 'org_admin' || role === 'platform_admin';
```

### List Org Integrations
```typescript
const integrations = await getOrgIntegrations(orgId);
// Returns: [{ id, type, label, created_at, updated_at }, ...]
// Note: credentials NOT included (secure)
```

### Save MightyCall Credentials
```typescript
await saveOrgIntegration(orgId, {
  integration_type: 'mightycall',
  label: 'Production MightyCall',
  credentials: {
    api_key: '...',
    user_key: '...',
    base_url: 'https://api.mightycall.com'
  }
});
```

## Testing

### Run Tests
```bash
# Smoke tests (all endpoints)
node scripts/smoke-test.js

# RLS verification
node scripts/verify-rls.js
```

### Manual Testing Checklist
- [ ] Login with email/password
- [ ] See org list (should not be empty)
- [ ] Select different org from dropdown
- [ ] Dashboard metrics update for selected org
- [ ] Create MightyCall integration (admin)
- [ ] Sync phone numbers (admin)
- [ ] View phone numbers page
- [ ] Logout & login again
- [ ] Org selection persists (in AuthContext)

## Environment Variables

### Server `.env`
```
NODE_ENV=development|production
PORT=4000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SERVICE_KEY=<secret-for-edge-functions>
MIGHTYCALL_API_KEY=optional
MIGHTYCALL_USER_KEY=optional
MIGHTYCALL_BASE_URL=https://api.mightycall.com
```

### Client `.env.local`
```
VITE_API_BASE_URL=http://localhost:4000
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## Debugging

### Check RLS Policies
```bash
# In Supabase Dashboard:
# Database > Policies > select table
# View all policies
```

### Check Sync Jobs
```sql
SELECT * FROM integration_sync_jobs 
WHERE org_id = '<org-id>'
ORDER BY created_at DESC 
LIMIT 10;
```

### Server Logs
```bash
# Terminal where server is running
tail -f server-output.txt
```

### Browser DevTools
```javascript
// In browser console:
const { user, orgs, selectedOrgId } = await fetch('/api/user/profile').then(r => r.json());
console.log({ user, orgs, selectedOrgId });
```

## Performance Tips

1. **Use `selectedOrgId` Dependency**
   - Add to useEffect dependencies when fetching org data
   - Prevents unnecessary API calls when org changes

2. **Memoize List Items**
   - Use `React.memo()` for list components
   - Prevent re-renders when org changes

3. **Batch API Calls**
   - Fetch all metrics in one call
   - Avoid N+1 queries

4. **Cache Results**
   - Use React Query (future enhancement)
   - Cache org list, integrations, phone numbers

## Production Checklist

- [ ] All tests passing (smoke + RLS)
- [ ] Environment variables configured
- [ ] Database migration applied
- [ ] Server built & deployed
- [ ] Client built & deployed to CDN
- [ ] Edge Functions deployed
- [ ] Monitoring & alerting configured
- [ ] SSL certificates valid
- [ ] CORS configured correctly
- [ ] Rate limiting enabled

## Support & Troubleshooting

### "Cannot read property 'orgs' of null"
**Cause:** AuthContext not loaded yet  
**Fix:** Check if `useAuth()` is inside `AuthProvider`

### "Organization not found" error
**Cause:** User not in org_members table  
**Fix:** Run `POST /api/user/onboard` endpoint

### MightyCall sync not working
**Cause:** Invalid credentials or IP blocked  
**Fix:** Check org_integrations credentials, test in Postman

### RLS blocking read/write
**Cause:** User not in org or doesn't have role  
**Fix:** Add user to org_members with correct role

---

**Last Updated:** February 1, 2026
