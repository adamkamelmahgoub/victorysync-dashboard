# VictorySync Dashboard - Developer Quick Reference

Quick reference guide for developers working with VictorySync Dashboard.

## Project Overview

**VictorySync** is a production-ready call center management dashboard with:
- React 18 frontend + Tailwind CSS
- Node.js/Express backend
- Supabase Postgres database with RLS
- MightyCall integration via Edge Functions
- Multi-tenant organization support

---

## File Structure Quick Map

```
victorysync-dashboard/
├── client/src/
│   ├── contexts/AuthContext.tsx           # Auth state, org list, selectedOrgId
│   ├── lib/apiClient.ts                   # HTTP wrapper, all API calls
│   ├── components/
│   │   ├── AdminTopNav.tsx                # Org switcher dropdown
│   │   ├── Dashboard.tsx                  # Main dashboard/metrics
│   │   └── [other components]
│   ├── pages/
│   │   ├── Numbers.tsx                    # Phone number management
│   │   ├── Calls.tsx                      # Call history
│   │   ├── Recordings.tsx                 # Call recordings
│   │   ├── SMS.tsx                        # SMS messages
│   │   └── [other pages]
│   └── App.tsx                            # React Router setup
├── server/src/
│   └── index.ts                           # All Express routes (6000+ lines)
│       ├── Health checks
│       ├── Auth endpoints (/api/user/*)
│       ├── Admin endpoints (/api/admin/*)
│       ├── MightyCall sync (/api/mightycall/*)
│       ├── Data endpoints (/api/calls/*, /api/recordings/*, etc.)
│       └── Middleware (apiKeyAuthMiddleware, role validation)
├── supabase/
│   ├── migrations/000_full_migration.sql  # Schema + RLS + helpers
│   └── functions/mightycall-webhook/
│       └── index.ts                       # Edge Function (Deno)
└── tests/
    ├── smoke-e2e.js                       # 10 E2E tests
    └── rls-verification.js                # 8+ RLS tests
```

---

## Common Tasks

### Adding a New Endpoint

1. **Backend** (`server/src/index.ts`):
   ```typescript
   app.get('/api/path', apiKeyAuthMiddleware, async (req, res) => {
     const actor = req.header('x-user-id');
     const hasApiKey = !!req.apiKeyScope;
     
     // Authorization check
     if (hasApiKey && req.apiKeyScope?.scope !== 'platform') {
       return res.status(403).json({ error: 'Unauthorized' });
     }
     
     // Implementation
     try {
       const data = await supabase.from('table').select('*');
       res.json(data);
     } catch (err: any) {
       res.status(500).json({ error: err.message });
     }
   });
   ```

2. **Frontend** (`client/src/lib/apiClient.ts`):
   ```typescript
   export async function getMyData(orgId?: string) {
     return makeRequest('/api/path', {
       method: 'GET',
       params: { orgId }
     });
   }
   ```

3. **Use in Component**:
   ```typescript
   const { data } = await apiClient.getMyData(selectedOrgId);
   ```

### Adding a Database Table

1. **Create migration** in `supabase/migrations/001_new_table.sql`:
   ```sql
   CREATE TABLE new_table (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     organization_id UUID NOT NULL REFERENCES organizations(id),
     created_at TIMESTAMP DEFAULT now(),
     data JSONB
   );

   ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Org members can read own org data"
     ON new_table FOR SELECT
     USING (organization_id IN (
       SELECT organization_id FROM org_members WHERE user_id = auth.uid()
     ) OR is_platform_admin(auth.uid()));
   ```

2. **Push migration**: `supabase db push`

3. **Update backend** to use new table

### Adding a React Component

1. **Create component** in `client/src/components/NewComponent.tsx`:
   ```typescript
   import { useAuth } from '@/contexts/AuthContext';
   import apiClient from '@/lib/apiClient';

   export default function NewComponent() {
     const { selectedOrgId } = useAuth();
     const [data, setData] = useState([]);

     useEffect(() => {
       apiClient.getData(selectedOrgId).then(d => setData(d));
     }, [selectedOrgId]);

     return <div>Content</div>;
   }
   ```

2. **Add route** in `client/src/App.tsx`

3. **Add navigation link** in `client/src/components/AdminTopNav.tsx`

---

## Environment Variables

### Backend (`server/.env`)
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MIGHTYCALL_API_KEY=your-api-key
MIGHTYCALL_USER_KEY=your-user-key
PORT=4000
NODE_ENV=development
```

### Frontend (`client/.env.local`)
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:4000
```

### Supabase Secrets (Edge Functions)
```bash
npx supabase secrets set MIGHTYCALL_WEBHOOK_SECRET="your-secret"
```

---

## Common Queries

### Check User Permissions
```typescript
// Backend helper
async function isPlatformAdmin(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('global_role')
    .eq('id', userId)
    .single();
  return data?.global_role === 'platform_admin';
}

async function isOrgAdmin(userId: string, orgId: string) {
  const { data } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .single();
  return data?.role === 'admin';
}
```

### Get User's Organizations
```typescript
const { data: orgs } = await supabase
  .from('org_members')
  .select('organizations(*)')
  .eq('user_id', userId);
```

### Sync MightyCall Data
```typescript
// Backend endpoint
POST /api/mightycall/sync/phone-numbers
POST /api/mightycall/sync/reports
POST /api/mightycall/sync/recordings

// Frontend
await apiClient.triggerMightyCallPhoneNumberSync(orgId);
```

---

## Testing

### Run E2E Tests
```bash
# With API server running on :4000
node tests/smoke-e2e.js
```

### Run RLS Verification
```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-anon-key
export SUPABASE_ROLE_KEY=your-service-role-key
node tests/rls-verification.js
```

### Add New Test
```javascript
await test('Test name', async () => {
  const res = await makeRequest('GET', '/api/endpoint');
  assert(res.status === 200, 'Should return 200');
});
```

---

## Debugging

### Backend
```bash
# Development with auto-reload
cd server && npm run dev

# Build and run production
npm run build && npm start

# Tail logs
console.log('[MODULE] message:', data);
```

### Frontend
```bash
# Development server with HMR
cd client && npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Browser console
console.log('Debug:', data);
```

### Database
```sql
-- Check RLS is enabled
SELECT schemaname, tablename FROM pg_tables 
WHERE schemaname = 'public';

-- View RLS policies
SELECT * FROM pg_policies;

-- Test specific query as user
SELECT * FROM phone_numbers 
WHERE organization_id = 'your-org-id'; -- Will be RLS-filtered
```

---

## Security Checklist

- [ ] No secrets in client code (use env vars)
- [ ] API keys validated on backend
- [ ] RLS policies tested and verified
- [ ] Role validation on all admin endpoints
- [ ] CORS restricted to frontend domain
- [ ] HTTPS enforced on all endpoints
- [ ] Webhook signature verification enabled
- [ ] Credentials encrypted in database
- [ ] Service role key never exposed to client
- [ ] Error messages don't leak sensitive info

---

## Performance Tips

1. **Database Queries**:
   ```typescript
   // ✅ Good: Select specific columns
   const { data } = await supabase
     .from('calls')
     .select('id, duration, direction, created_at')
     .limit(100);

   // ❌ Slow: Select all columns
   const { data } = await supabase
     .from('calls')
     .select('*');
   ```

2. **Frontend Caching**:
   ```typescript
   // Cache org data in context instead of fetching each component
   const { orgs } = useAuth(); // Already fetched at init
   ```

3. **API Pagination**:
   ```typescript
   // Add limit/offset for large result sets
   .select('*')
   .range(0, 50)
   ```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Server won't start | Check env vars, port 4000 free, Supabase connectivity |
| Frontend blank | Check browser console for errors, VITE_* env vars set |
| "Org not found" | Run POST /api/user/onboard, check org_members record |
| 401 on endpoint | Verify auth header, API key, or session valid |
| RLS blocking reads | Check org_members record exists, RLS policy correct |
| Webhook not firing | Verify MIGHTYCALL_WEBHOOK_SECRET set, function deployed |

---

## Resources

- [Production Deployment Guide](PRODUCTION_DEPLOYMENT_GUIDE.md)
- [MightyCall Webhook Setup](functions/MIGHTYCALL_WEBHOOK_SETUP.md)
- [API Reference](API_REFERENCE.md)
- [Implementation Complete](IMPLEMENTATION_COMPLETE_FINAL.md)
- [Supabase Docs](https://supabase.com/docs)
- [React Docs](https://react.dev)
- [Express Docs](https://expressjs.com)

---

## Key Contacts & Repo Info

- **Repository**: victorysync-dashboard (local)
- **Main Endpoint**: http://localhost:4000 (dev) / https://your-domain.com (prod)
- **Dashboard**: http://localhost:5173 (dev) / https://app.your-domain.com (prod)
- **Supabase Project**: edsyhtlaqwiicxlzorca (production)
- **MightyCall Account**: [Your account ID]

---

**Last Updated**: February 1, 2026  
**Version**: 1.0  
**Status**: Production Ready
