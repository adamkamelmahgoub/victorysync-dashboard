# VictorySync Dashboard — Complete API Reference

**Base URL:** `http://localhost:4000` (dev) or `https://api.yourdomain.com` (prod)  
**Content-Type:** `application/json`

## Authentication

All endpoints (except `/health`) require one of:
1. **User Token:** Supabase JWT in `Authorization: Bearer <token>` header
2. **API Key:** `x-api-key: <key>` header (for org API keys)
3. **Service Key:** `x-service-key: <key>` header (for Edge Functions)

User tokens are automatically included by Supabase Auth client.

## User Authentication & Profile

### GET /api/user/profile

Fetch authenticated user's profile including global role.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "global_role": "platform_admin" | "user",
  "created_at": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `401 Unauthorized` — Missing or invalid token
- `404 Not Found` — Profile not found

---

### GET /api/user/orgs

Fetch organizations where the user is a member.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
[
  {
    "id": "org-uuid",
    "name": "Acme Inc",
    "slug": "acme-inc",
    "role": "org_admin" | "manager" | "agent",
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

**Empty array:** User has no org memberships (call POST `/api/user/onboard` to create)

---

### POST /api/user/onboard

Create initial organization for user with no existing orgs.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Request Body:**
```json
{
  "org_name": "My Company"
}
```

**Response:**
```json
{
  "id": "new-org-uuid",
  "name": "My Company",
  "slug": "my-company",
  "role": "org_admin",
  "created_at": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `400 Bad Request` — User already has orgs
- `409 Conflict` — Organization name already taken

---

## Organization Management (Admin Only)

### GET /api/admin/orgs

List all organizations (platform admin only).

**Headers:**
```
Authorization: Bearer <jwt-token>
x-api-key: <optional-platform-api-key>
```

**Query Parameters:**
- `skip` (number) — Pagination offset
- `limit` (number) — Items per page (default: 50)

**Response:**
```json
{
  "data": [
    {
      "id": "org-uuid",
      "name": "Acme Inc",
      "slug": "acme-inc",
      "timezone": "America/New_York",
      "member_count": 15,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 42,
  "skip": 0,
  "limit": 50
}
```

---

### POST /api/admin/orgs

Create new organization (platform admin only).

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Request Body:**
```json
{
  "name": "New Company",
  "timezone": "America/New_York"
}
```

**Response:**
```json
{
  "id": "new-org-uuid",
  "name": "New Company",
  "slug": "new-company",
  "timezone": "America/New_York",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

### GET /api/admin/orgs/:orgId

Get organization details.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Path Parameters:**
- `orgId` (uuid) — Organization ID

**Response:**
```json
{
  "id": "org-uuid",
  "name": "Acme Inc",
  "slug": "acme-inc",
  "timezone": "America/New_York",
  "member_count": 15,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Errors:**
- `403 Forbidden` — User not org admin
- `404 Not Found` — Organization not found

---

### PUT /api/admin/orgs/:orgId

Update organization (org admin required).

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Request Body:**
```json
{
  "name": "Updated Company Name",
  "timezone": "America/Chicago"
}
```

**Response:**
```json
{
  "id": "org-uuid",
  "name": "Updated Company Name",
  "timezone": "America/Chicago",
  "updated_at": "2024-01-20T14:30:00Z"
}
```

---

### DELETE /api/admin/orgs/:orgId

Delete organization (platform admin only).

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{ "success": true }
```

---

## Organization Members

### GET /api/admin/orgs/:orgId/members

List organization members.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `skip` (number) — Pagination offset
- `limit` (number) — Items per page (default: 50)

**Response:**
```json
{
  "data": [
    {
      "id": "member-uuid",
      "user_id": "user-uuid",
      "email": "agent@example.com",
      "full_name": "Jane Smith",
      "role": "agent",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 15
}
```

---

### POST /api/admin/orgs/:orgId/members

Add user to organization.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "role": "agent" | "manager" | "org_admin"
}
```

**Response:**
```json
{
  "id": "member-uuid",
  "user_id": "user-uuid",
  "email": "newuser@example.com",
  "role": "agent",
  "created_at": "2024-01-20T14:30:00Z"
}
```

**Errors:**
- `400 Bad Request` — Invalid role or user doesn't exist
- `409 Conflict` — User already in organization

---

### DELETE /api/admin/orgs/:orgId/members/:memberId

Remove user from organization.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{ "success": true }
```

---

## Organization Integrations (Credentials)

### GET /api/admin/orgs/:orgId/integrations

List integrations (without credentials).

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
[
  {
    "id": "integration-uuid",
    "integration_type": "mightycall",
    "label": "Production MightyCall",
    "status": "active",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
]
```

---

### POST /api/admin/orgs/:orgId/integrations

Create or update organization integration.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Request Body:**
```json
{
  "integration_type": "mightycall",
  "label": "Production MightyCall",
  "credentials": {
    "api_key": "your-mightycall-api-key",
    "user_key": "your-mightycall-user-key",
    "base_url": "https://api.mightycall.com"
  }
}
```

**Response:**
```json
{
  "id": "integration-uuid",
  "integration_type": "mightycall",
  "label": "Production MightyCall",
  "status": "active",
  "created_at": "2024-01-20T14:30:00Z",
  "updated_at": "2024-01-20T14:30:00Z"
}
```

**Errors:**
- `400 Bad Request` — Invalid credentials format
- `403 Forbidden` — User not org admin

---

### DELETE /api/admin/orgs/:orgId/integrations/:integrationId

Delete integration.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{ "success": true }
```

---

## Phone Numbers

### GET /api/orgs/:orgId/phone-numbers

List organization phone numbers.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `skip` (number)
- `limit` (number)
- `status` (string) — Filter by status: "active", "inactive", "unassigned"

**Response:**
```json
{
  "data": [
    {
      "id": "phone-uuid",
      "number": "+12125551234",
      "status": "active",
      "assigned_to_name": "Jane Smith",
      "assigned_to_user_id": "user-uuid",
      "call_count": 42,
      "last_call_at": "2024-01-20T14:30:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 8
}
```

---

### POST /api/mightycall/sync/phone-numbers

Trigger phone number sync from MightyCall.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `orgId` (uuid) — Organization to sync

**Response:**
```json
{
  "job_id": "sync-job-uuid",
  "status": "queued",
  "type": "phone_numbers",
  "org_id": "org-uuid",
  "created_at": "2024-01-20T14:30:00Z"
}
```

---

### POST /api/orgs/:orgId/phone-numbers/:phoneId/assign

Assign phone number to user.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Request Body:**
```json
{
  "user_id": "user-uuid"
}
```

**Response:**
```json
{
  "id": "phone-uuid",
  "number": "+12125551234",
  "assigned_to_user_id": "user-uuid",
  "assigned_at": "2024-01-20T14:30:00Z"
}
```

---

### DELETE /api/orgs/:orgId/phone-numbers/:phoneId/assign

Unassign phone number from user.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "id": "phone-uuid",
  "number": "+12125551234",
  "assigned_to_user_id": null,
  "unassigned_at": "2024-01-20T14:30:00Z"
}
```

---

## Calls & Reports

### GET /api/orgs/:orgId/calls

List calls for organization.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `skip` (number)
- `limit` (number)
- `date_from` (ISO 8601) — Filter calls from date
- `date_to` (ISO 8601) — Filter calls to date
- `phone_number` (string) — Filter by phone number

**Response:**
```json
{
  "data": [
    {
      "id": "call-uuid",
      "phone_number": "+12125551234",
      "caller_name": "John Customer",
      "duration_seconds": 180,
      "status": "completed",
      "type": "inbound" | "outbound" | "missed",
      "date": "2024-01-20T14:30:00Z"
    }
  ],
  "total": 524
}
```

---

### POST /api/mightycall/sync/reports

Trigger call reports sync from MightyCall.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `orgId` (uuid)
- `date_from` (ISO 8601) — Optional

**Response:**
```json
{
  "job_id": "sync-job-uuid",
  "status": "queued",
  "type": "reports",
  "org_id": "org-uuid"
}
```

---

## Recordings

### GET /api/orgs/:orgId/recordings

List call recordings.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `skip` (number)
- `limit` (number)
- `phone_number` (string)
- `date_from` (ISO 8601)
- `date_to` (ISO 8601)

**Response:**
```json
{
  "data": [
    {
      "id": "recording-uuid",
      "call_id": "call-uuid",
      "phone_number": "+12125551234",
      "duration_seconds": 180,
      "url": "https://mightycall.com/recordings/...",
      "date": "2024-01-20T14:30:00Z"
    }
  ],
  "total": 128
}
```

---

### POST /api/mightycall/sync/recordings

Trigger recordings sync from MightyCall.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `orgId` (uuid)
- `date_from` (ISO 8601) — Optional

**Response:**
```json
{
  "job_id": "sync-job-uuid",
  "status": "queued",
  "type": "recordings"
}
```

---

## SMS

### GET /api/orgs/:orgId/sms

List SMS messages.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `skip` (number)
- `limit` (number)
- `phone_number` (string)
- `direction` (string) — "inbound" or "outbound"
- `date_from` (ISO 8601)
- `date_to` (ISO 8601)

**Response:**
```json
{
  "data": [
    {
      "id": "sms-uuid",
      "phone_number": "+12125551234",
      "direction": "inbound",
      "message": "Hi, I need to reschedule my appointment",
      "sender": "+14155551234",
      "date": "2024-01-20T14:30:00Z"
    }
  ],
  "total": 89
}
```

---

### POST /api/mightycall/sync/sms

Trigger SMS sync from MightyCall.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `orgId` (uuid)
- `date_from` (ISO 8601) — Optional

**Response:**
```json
{
  "job_id": "sync-job-uuid",
  "status": "queued",
  "type": "sms"
}
```

---

## Metrics & Analytics

### GET /api/client-metrics

Fetch global metrics (all orgs, platform admin only).

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "total_calls": 5000,
  "total_calls_today": 125,
  "total_sms": 1200,
  "total_organizations": 42,
  "total_users": 156,
  "avg_call_duration_minutes": 3.5,
  "queue_status": "healthy"
}
```

---

### GET /api/orgs/:orgId/metrics

Fetch organization metrics.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "calls_today": 25,
  "calls_this_month": 450,
  "sms_today": 12,
  "sms_this_month": 180,
  "avg_call_duration_minutes": 3.2,
  "queue_wait_minutes": 1.5,
  "agents_online": 8,
  "agents_idle": 2
}
```

---

### GET /api/orgs/:orgId/activity

Fetch recent activity log.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `skip` (number)
- `limit` (number)
- `type` (string) — Filter by activity type: "call", "sms", "user_login", "integration_sync"

**Response:**
```json
{
  "data": [
    {
      "id": "activity-uuid",
      "type": "call",
      "description": "Incoming call from +14155551234 to +12125551234 (3m 45s)",
      "user": "Jane Smith",
      "timestamp": "2024-01-20T14:30:00Z"
    }
  ],
  "total": 542
}
```

---

## Sync Jobs

### GET /api/mightycall/sync/jobs

List recent sync jobs.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Query Parameters:**
- `orgId` (uuid) — Filter by organization
- `type` (string) — Filter by type: "phone_numbers", "reports", "recordings", "sms"
- `status` (string) — Filter by status: "pending", "running", "completed", "failed"
- `skip` (number)
- `limit` (number)

**Response:**
```json
{
  "data": [
    {
      "id": "job-uuid",
      "org_id": "org-uuid",
      "integration_id": "integration-uuid",
      "type": "phone_numbers",
      "status": "completed",
      "result": {
        "synced_count": 12,
        "new_numbers": 2,
        "updated_numbers": 10
      },
      "error_message": null,
      "started_at": "2024-01-20T14:30:00Z",
      "completed_at": "2024-01-20T14:32:00Z"
    }
  ],
  "total": 156
}
```

---

## API Keys (Organization Level)

### POST /api/orgs/:orgId/api-keys

Create API key for organization.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Request Body:**
```json
{
  "name": "Mobile App API Key"
}
```

**Response:**
```json
{
  "id": "key-uuid",
  "name": "Mobile App API Key",
  "key": "sk_live_1234567890abcdef",
  "created_at": "2024-01-20T14:30:00Z"
}
```

**Note:** Key is only returned once. Save securely.

---

### GET /api/orgs/:orgId/api-keys

List API keys.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
[
  {
    "id": "key-uuid",
    "name": "Mobile App API Key",
    "created_at": "2024-01-20T14:30:00Z",
    "last_used_at": "2024-01-20T15:00:00Z"
  }
]
```

---

### DELETE /api/orgs/:orgId/api-keys/:keyId

Revoke API key.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{ "success": true }
```

---

## System

### GET /health

Check server health.

**Response:**
```json
{ "status": "ok" }
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {} // Optional additional info
}
```

### Common Error Codes

| Code | HTTP Status | Meaning |
|------|------------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | User lacks permission |
| `NOT_FOUND` | 404 | Resource not found |
| `BAD_REQUEST` | 400 | Invalid request parameters |
| `CONFLICT` | 409 | Resource already exists or operation conflicts |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

- **Unauthenticated:** 60 requests per minute per IP
- **Authenticated:** 1000 requests per minute per user
- **Sync Jobs:** 10 per minute per org

---

## Pagination

All list endpoints support:
- `skip` (number, default: 0) — Offset from start
- `limit` (number, default: 50, max: 500) — Items per page

Response includes:
```json
{
  "data": [...],
  "total": 1000,
  "skip": 0,
  "limit": 50
}
```

---

## Timestamps

All timestamps are ISO 8601 format (UTC):
```
2024-01-20T14:30:00Z
```

---

**Last Updated:** February 1, 2026
