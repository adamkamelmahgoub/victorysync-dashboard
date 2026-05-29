# Technical Reference: Supabase Client Auth Architecture

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ AuthProvider (AuthContext.tsx)                       │   │
│  │ ─ Manages: user, orgId, loading, globalRole        │   │
│  │ ─ Source: User metadata (auth claims)              │   │
│  │ ✅ NO profiles table queries                        │   │
│  └──────────────────────────────────────────────────────┘   │
│           ↓                                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ OrgProvider (OrgContext.tsx)                         │   │
│  │ ─ Manages: org, member, loading, error             │   │
│  │ ─ Queries: org_users, organizations                │   │
│  │ ✅ Request deduplication (no spam)                  │   │
│  └──────────────────────────────────────────────────────┘   │
│           ↓                                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Dashboard & Pages                                   │   │
│  │ ─ Uses: org + member from OrgContext               │   │
│  │ ✅ Loading/error states implemented                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         ↓                          ↓
   Supabase Auth              Supabase REST API
```

## Data Flow: Client Login → Dashboard

### Step 1: Authentication
```
User enters credentials → Supabase Auth → Returns session with user object
                                           ↓
                                    user_metadata: {
                                      org_id: 'uuid',
                                      role: 'agent',
                                      global_role: null  // or 'admin'
                                    }
```

### Step 2: AuthContext Initialization
```
supabase.auth.getSession() 
  ↓
✅ Extract globalRole from user.user_metadata.global_role
✅ NO profiles table queries
✅ Set user state immediately
```

### Step 3: OrgContext Initialization
```
useAuth() → get user, globalRole
  ↓
IF globalRole === 'admin' → Platform admin, no org required ✅
  ↓
ELSE → Query org_users table
  ├─ SELECT org_id, user_id, role FROM org_users WHERE user_id = ?
  │   ✅ Returns 200 OK (working query)
  │   ├─ If 0 rows (code=PGRST116) → Try metadata fallback
  │   └─ If 1+ rows → Use first row as member
  │
  └─ Query organizations table
      ├─ SELECT * FROM organizations WHERE id = ?
      └─ ✅ Returns 200 OK (working query)
```

### Step 4: Dashboard Rendering
```
if (loading) → Show spinner
else if (error) → Show error message
else if (no org) → Show "No organization linked"
else → Render dashboard with org data ✅
```

## Request Deduplication Pattern

### Problem Without Dedup:
```
User logs in → OrgContext mounts
             → fetchOrgData() called
             → user dependency changes → called again
             → globalRole dependency changes → called again
             = 3+ concurrent org_users queries (waste)
```

### Solution With Dedup:
```typescript
const fetchInProgressRef = useRef(false);
const lastUserIdRef = useRef<string | null>(null);

const fetchOrgData = async () => {
  // Guard 1: Concurrent fetch prevention
  if (fetchInProgressRef.current) {
    return;  // Skip if already fetching
  }

  // Guard 2: Duplicate fetch prevention  
  if (lastUserIdRef.current === user.id && org && !loading) {
    return;  // Skip if already fetched for this user
  }

  try {
    fetchInProgressRef.current = true;
    // ... perform query
  } finally {
    fetchInProgressRef.current = false;
    lastUserIdRef.current = user.id;  // Remember we fetched this user
  }
};
```

**Result:** Only 1 org_users query per user, not 3+ 🎯

## Error Handling: Supabase Error Codes

### PGRST116 - No Rows Found (Expected)
```typescript
if (memberError?.code === 'PGRST116') {
  // This is EXPECTED if user not in org_users
  // Try metadata fallback
  if (metadataOrgId) {
    // Use metadata org_id
  } else {
    // No org anywhere - clean state
  }
}
```

### Other Errors (Unexpected)
```typescript
if (memberError && memberError.code !== 'PGRST116') {
  // Log and show error state
  console.error('Unexpected error:', memberError);
  setError(memberError.message);
}
```

## Supabase Query Reference

### ✅ CORRECT Queries (Used After Fix)

```typescript
// 1. Get org membership
const { data, error } = await supabase
  .from('org_users')
  .select('org_id, user_id, role')
  .eq('user_id', userId)
  .single();
// Returns: { org_id: 'uuid', user_id: 'uuid', role: 'agent' }

// 2. Get organization
const { data, error } = await supabase
  .from('organizations')
  .select('*')
  .eq('id', orgId)
  .single();
// Returns: { id, name, timezone, sla_target_percent, ... }

// 3. Get all user organizations (optional)
const { data, error } = await supabase
  .from('org_users')
  .select('org_id, role')
  .eq('user_id', userId);
// Returns: [{ org_id: 'uuid', role: 'agent' }, ...]
```

### ❌ WRONG Queries (Removed After Fix)

```typescript
// ❌ Malformed - caused 400 errors
const { data, error } = await supabase
  .from('profiles')
  .select('global_role')
  .eq('id', user.id)
  .maybeSingle();
// Problem: Created RLS interference, unnecessary

// ❌ Wrong table reference
const { data, error } = await supabase
  .from('profiles')
  .select('global_role, global_role_id')
  .eq('role_id', user.id);
// Problem: 'global_role_id' column doesn't exist, 'role_id' is wrong filter
```

## Authentication vs. Authorization Split

### Authentication (AuthContext) - WHO are you?
```typescript
// Source: Supabase Auth + user metadata
{
  user: User,          // From auth.users
  globalRole: string,  // From user metadata (auth claim)
  orgId: string,       // From user metadata (org assignment)
}
```

**Queries:** ✅ No database queries needed - all from metadata

### Authorization (OrgContext) - WHAT can you access?
```typescript
// Source: Supabase Database tables
{
  org: Organization,       // From organizations table
  member: OrgMember,       // From org_users table
  role: 'agent'|'admin',   // From org_users.role
}
```

**Queries:** ✅ org_users + organizations tables only

---

## State Dependency Graph

```
Auth loaded
    ↓
globalRole determined
    ↓
OrgContext checks: is admin?
    ├─ YES → Show platform admin dashboard
    └─ NO → Fetch org membership
            ↓
        org_users query
            ├─ Found → Get org details
            │   ↓
            │   organizations query
            │   ↓
            │   Show org dashboard ✅
            │
            └─ Not found → Try metadata fallback
                ├─ Success → Show org dashboard ✅
                └─ Fail → Show "No organization" message
```

## Performance Metrics

### Request Timeline (After Fix)

```
T+0ms:    User clicks "Sign in"
T+50ms:   Supabase Auth request
T+150ms:  Auth response → user metadata available
          AuthContext sets globalRole from metadata ✅
T+160ms:  OrgContext starts → queries org_users
T+250ms:  org_users response (single row found) ✅
T+260ms:  OrgContext queries organizations
T+350ms:  organizations response ✅
T+360ms:  Dashboard renders with org data
T+400ms:  metrics API calls (async, doesn't block rendering)
T+1200ms: Dashboard fully interactive ✅

Total time to usable dashboard: ~800-1200ms
```

### Query Count
- **Auth queries:** 1 (login)
- **Org queries:** 2 (org_users + organizations)
- **Metrics queries:** ~1-3 (parallel)
- **Total:** 4-6 requests

**No wasted/failed requests** ✅

## Fallback Logic

```typescript
// Priority order for org resolution:
1. org_users table → org_id + role (PRIMARY)
2. User metadata → org_id + role from metadata (FALLBACK)
3. None → Show "No organization linked" (CLEAN STATE)
```

This ensures:
- ✅ Works even if org_users query fails
- ✅ Consistent org resolution
- ✅ Clean fallback behavior

## Future Enhancements (Optional)

### Multi-Org Support
```typescript
// If user is in multiple orgs, show selector:
async function getMultipleOrgs(userId) {
  const memberships = await getUserOrganizations(userId);
  if (memberships.length > 1) {
    showOrgSelector(memberships);  // User picks which org
  }
}
```

### Cached Org Context
```typescript
// Don't refetch org if already loaded this session
const lastOrgIdRef = useRef(null);
if (lastOrgIdRef.current === org.id) {
  skipRefresh();
}
```

### Permission Scoping
```typescript
// Load user permissions based on role
const { canViewBilling, canManageAgents } = 
  member.role === 'org_admin' ? getAllPermissions() : getLimitedPermissions();
```

---

## Debugging Checklist

### User can't login
- [ ] Check Supabase Auth is configured
- [ ] Check auth service key in environment
- [ ] Check user exists in auth.users table

### User logs in but sees "No organization"
- [ ] Check user_metadata.org_id is set
- [ ] Check org_users table has a row for this user
- [ ] Check organizations table has matching org_id
- [ ] Check browser console for error messages

### 400 errors in Network tab
- [ ] Hard refresh browser (Ctrl+Shift+R)
- [ ] Clear browser cache
- [ ] Check no code references old `.from('profiles')` queries
- [ ] Verify frontend built with latest code

### Slow dashboard load
- [ ] Check Network tab - no request spam?
- [ ] Check any heavy computations in components
- [ ] Profile with DevTools Performance tab
- [ ] Verify org has data (calls, metrics, etc.)

### Wrong role displayed
- [ ] Check user_metadata.global_role for admins
- [ ] Check org_users.role for org membership
- [ ] Verify role enum values (agent, org_admin, etc.)

---

## Code Standards

### ✅ DO
- Use user metadata for auth claims (fast, reliable)
- Query org_users for org membership (RLS-friendly)
- Handle PGRST116 as expected condition
- Deduplicate requests with refs
- Show loading/error states
- Log context in console messages: `[AuthContext]`, `[OrgContext]`

### ❌ DON'T
- Query profiles table from client (not needed)
- Make multiple concurrent org queries
- Ignore "no rows" as error (it's valid state)
- Trust role without checking source
- Render org data before it's loaded
- Log sensitive data (tokens, passwords)

---

## References

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Query API](https://supabase.com/docs/reference/javascript/select)
- [Error Codes](https://supabase.com/docs/reference/postgresql/errors)
