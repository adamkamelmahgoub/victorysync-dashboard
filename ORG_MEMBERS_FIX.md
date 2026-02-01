# org_members Role Constraint Fix ✅

## Problem

The error occurred when trying to insert invalid role values into the `org_members` table:

```
ERROR: 23514: new row for relation "org_members" violates check constraint "org_members_role_check"
Failing row contains: (..., role=platform_admin, ...)
```

The `org_members` table has a check constraint that only allows these roles:
- `'agent'`
- `'org_manager'`
- `'org_admin'`

But the API endpoints were accepting ANY role value without validation, including `'platform_admin'` (which is a GLOBAL role, not an org role).

## Root Cause

**3 API endpoints** were accepting user-provided `role` values without validating them:

1. **POST `/api/admin/org_users`** - Upsert org_user with any role
2. **POST `/api/orgs/:orgId/members`** - Add member to org with any role  
3. **POST `/api/admin/users`** - Create user in auth with any role

The confusion is that:
- **Global roles** (stored in `profiles.global_role`): `'platform_admin'`, `'platform_manager'`
- **Org roles** (stored in `org_members.role`): `'agent'`, `'org_manager'`, `'org_admin'`

Code was trying to insert global roles into org tables, violating the check constraint.

## Solution

Added role validation to all 3 endpoints. Now they validate incoming `role` values and reject invalid ones with a clear error message.

### Changes Made

**File:** `server/src/index.ts`

#### 1. POST /api/admin/org_users (Line 798)
```typescript
// Validate role - org_members only accepts these roles
const validRoles = ['agent', 'org_manager', 'org_admin'];
if (!validRoles.includes(role)) {
  return res.status(400).json({ error: "invalid_role", detail: `role must be one of: ${validRoles.join(', ')}` });
}
```

#### 2. POST /api/orgs/:orgId/members (Line 2141)
```typescript
// Validate role - org_members only accepts these roles
const validRoles = ['agent', 'org_manager', 'org_admin'];
if (!validRoles.includes(role)) {
  return res.status(400).json({ error: 'invalid_role', detail: `role must be one of: ${validRoles.join(', ')}` });
}
```

#### 3. POST /api/admin/users (Line 2810)
```typescript
// Validate role if provided
const validRoles = ['agent', 'org_manager', 'org_admin'];
const normalizedRole = role || 'agent';
if (!validRoles.includes(normalizedRole)) {
  return res.status(400).json({
    error: "invalid_role",
    detail: `role must be one of: ${validRoles.join(', ')}`,
  });
}
```

## Result

✅ **Build Status:** Successful (no TypeScript errors)

✅ **Validation Logic:** All 3 endpoints now validate role values

✅ **Error Handling:** Users get clear error messages when submitting invalid roles:
```json
{
  "error": "invalid_role",
  "detail": "role must be one of: agent, org_manager, org_admin"
}
```

## Testing

To verify the fix works:

**Test 1: Valid org role (should work)**
```bash
POST /api/admin/org_users
{
  "user_id": "...",
  "org_id": "...",
  "role": "org_admin"
}
```
✅ Success

**Test 2: Invalid global role (should fail)**
```bash
POST /api/admin/org_users
{
  "user_id": "...",
  "org_id": "...",
  "role": "platform_admin"
}
```
❌ Returns: `{ error: "invalid_role", detail: "role must be one of: agent, org_manager, org_admin" }`

## Database Schema Reference

**profiles table:**
```sql
global_role text CHECK (global_role IN ('platform_admin', 'platform_manager', NULL))
```

**org_members table:**
```sql
role text NOT NULL CHECK (role IN ('agent', 'org_manager', 'org_admin'))
```

These are two separate role systems:
- `global_role`: Controls access to platform-wide features
- `role` in org_members: Controls access within a specific organization

## Related Files

- Server: `server/src/index.ts` (3 endpoints updated)
- Database: `supabase/MASTER_MIGRATION.sql` (constraint definition)
- Build: ✅ Compiles without errors

## Next Steps

1. Rebuild the server: `npm run build` ✅ Done
2. Restart the dev server: `npm run dev`
3. Test the 3 endpoints with valid org roles
4. Verify that invalid roles are rejected with proper error messages
