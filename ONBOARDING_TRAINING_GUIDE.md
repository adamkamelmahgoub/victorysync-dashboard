# VictorySync Dashboard - Complete Onboarding & Training Guide

## Table of Contents

1. [System Overview](#system-overview)
2. [Getting Started](#getting-started)
3. [User Roles & Permissions](#user-roles--permissions)
4. [Feature Walkthrough](#feature-walkthrough)
5. [Admin Guide](#admin-guide)
6. [API Documentation](#api-documentation)
7. [Troubleshooting](#troubleshooting)
8. [Support & Resources](#support--resources)

---

## System Overview

VictorySync Dashboard is a comprehensive call center management platform that integrates with MightyCall to provide:

- **Real-time call metrics** and KPI tracking
- **Billing management** with invoice tracking
- **Organization & user management** with RBAC
- **Call recordings** with playback
- **SMS messaging** tracking and management
- **Admin controls** for platform management

### Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime (Postgres notify/listen)
- **Integration**: MightyCall API
- **Auth**: Supabase Auth (OAuth, Email/Password)

### Key URLs

- **Dashboard**: https://yourdomain.com
- **Admin Panel**: https://yourdomain.com/admin
- **API**: https://yourdomain.com/api
- **Health Check**: https://yourdomain.com/health

---

## Getting Started

### 1. Account Creation

**For Platform Admins:**
1. Contact system administrator for account creation
2. Provide email address and preferred password
3. Receive confirmation email with login link
4. Complete profile setup (name, phone, photo)

**For Organization Users:**
1. Organization admin invites via email
2. Click invitation link
3. Set password and complete profile
4. Access organization dashboard immediately

### 2. First Login

```
URL: https://yourdomain.com/login
Email: your@email.com
Password: Your secure password
```

#### First Time Setup

1. **Complete Profile**
   - Full name
   - Phone number (optional)
   - Profile photo (optional)

2. **Explore Dashboard**
   - View KPI cards
   - Check today's metrics
   - Navigate to your organization

3. **Set Organization** (if multiple organizations)
   - Dropdown in top-left
   - Select primary organization
   - View org-specific data

### 3. Password Management

**Change Password:**
1. Go to Settings → Account
2. Click "Change Password"
3. Enter current password
4. Enter new password (minimum 8 characters)
5. Click "Save"

**Reset Forgotten Password:**
1. On login page, click "Forgot Password?"
2. Enter email address
3. Check email for reset link
4. Create new password
5. Login with new password

---

## User Roles & Permissions

### Role Hierarchy

```
Platform Admin (top-level)
├── Can manage all organizations
├── Can manage all users
├── Can manage billing
└── Can access admin panel

Organization Admin
├── Can manage organization users
├── Can manage assigned phone numbers
├── Can manage organization settings
└── Can view organization billing

Organization Manager
├── Can view reports (assigned phones only)
├── Can manage assigned users
├── Can view recordings (assigned phones)
└── Limited settings access

Organization Agent
├── Can view own metrics
├── Can make/receive calls
├── Can view assigned recordings
└── Can send/receive SMS

Client/Viewer (Limited)
├── View-only access
├── No modification rights
└── Read-only reports
```

### Permission Types

| Permission | Agent | Manager | Admin | Platform Admin |
|-----------|-------|---------|-------|-----------------|
| View Reports | Assigned phones | Assigned phones | All | All |
| View Recordings | Assigned phones | Assigned phones | All | All |
| Send SMS | Own org | Own org | All | All |
| Manage Users | ❌ | Limited | ✅ | ✅ |
| Manage Phones | ❌ | Limited | ✅ | ✅ |
| Manage Billing | ❌ | ❌ | Limited | ✅ |
| View Admin Panel | ❌ | ❌ | ✅ | ✅ |

---

## Feature Walkthrough

### 1. Dashboard

**Location:** `/dashboard` or `/` (home)

**What You See:**
- Total calls today
- Answer rate percentage
- Average wait time (in minutes:seconds)
- Revenue metrics (if admin)

**Key Actions:**
- Set organization (dropdown, top-left)
- View time period (today, this week, this month)
- Click KPI cards for details

### 2. Reports

**Location:** `/admin/reports` (admin only)

**Available Metrics:**
- Call history (inbound/outbound)
- Call duration
- Call status (answered/missed)
- Agent performance
- Queue metrics

**Filters:**
- Date range
- Organization (admin only)
- Phone number
- Agent/extension
- Call status

**Export:**
- Download as CSV
- Generate report PDF
- Email report

### 3. Recordings

**Location:** `/admin/recordings`

**Features:**
- List all call recordings
- Filter by date, org, phone
- Play recordings directly
- Download recording files
- Duration and call metadata

**Playback:**
- Click "Play" button
- Built-in audio player
- Controls: play, pause, volume, speed

### 4. SMS Management

**Location:** `/admin/sms`

**Features:**
- View SMS history (inbound/outbound)
- Filter by organization, date, direction
- View message content
- Track delivery status

**Send SMS:**
1. Click "Send Message"
2. Select organization
3. Enter recipient number(s)
4. Type message
5. Click "Send"

### 5. Billing

**Location:** `/admin/billing`

**What's Tracked:**
- One-time charges
- Monthly subscriptions
- Invoice records
- Payment status

**Create Invoice:**
1. Click "Create Billing Record"
2. Select Organization
3. Select User
4. Enter Amount
5. Choose Type (one-time or recurring)
6. Add Description
7. Click "Save"

### 6. Organization Management

**Location:** `/admin/orgs`

**Manage:**
- Organization details
- Member list and roles
- Assigned phone numbers
- Integrations
- SLA targets

**Add Member:**
1. Click "Add Member"
2. Enter email
3. Select role (agent, manager, admin)
4. Click "Invite"

**Assign Phone:**
1. Click "Phone Numbers"
2. Select unassigned phones
3. Click "Assign"

### 7. Admin Panel

**Location:** `/admin`

**Sections:**
- Overview (system health, usage)
- Organizations (manage all orgs)
- Users (manage all users)
- Operations (sync data, settings)
- API Keys (manage integrations)

---

## Admin Guide

### Daily Tasks

#### Morning (Start of Day)

1. **Check System Health**
   - Go to Admin → Operations
   - Verify all systems operational
   - Check error logs

2. **Review Metrics**
   - Dashboard shows yesterday's performance
   - Compare to week/month average
   - Note any anomalies

3. **Sync Data**
   - Click "Sync MightyCall Data"
   - Verify sync completed (check logs)
   - Review any new records

#### Throughout the Day

1. **Monitor Reports**
   - Check Reports page for queue status
   - Monitor answer rate
   - Track average wait times

2. **Handle SMS**
   - Review incoming SMS messages
   - Send responses as needed
   - Check delivery status

3. **User Management**
   - Add new users as requested
   - Update roles as needed
   - Deactivate inactive accounts

#### End of Day

1. **Generate Reports**
   - Export daily metrics
   - Email to stakeholders
   - Archive for compliance

2. **Review Issues**
   - Check error logs
   - Address any system issues
   - Plan for next day

### Weekly Tasks

1. **Billing Review**
   - Reconcile invoices
   - Review pending charges
   - Process payments

2. **Organization Reviews**
   - Check organization health
   - Review member activity
   - Update SLA targets if needed

3. **Security Audit**
   - Review access logs
   - Check for unauthorized access
   - Update API keys if needed

4. **Backup Verification**
   - Confirm backups completed
   - Test restore procedures
   - Document any issues

### Monthly Tasks

1. **Performance Review**
   - Generate comprehensive reports
   - Compare to SLAs
   - Identify improvement areas

2. **Capacity Planning**
   - Review resource usage
   - Plan for growth
   - Scale infrastructure if needed

3. **Compliance Audit**
   - Review audit logs
   - Check data retention policies
   - Verify security measures

4. **User Cleanup**
   - Remove inactive users
   - Archive old data
   - Update documentation

---

## API Documentation

### Base URL
```
https://yourdomain.com/api
```

### Authentication

All requests require `x-user-id` header:

```bash
curl -H "x-user-id: your-user-id" \
  https://yourdomain.com/api/admin/orgs
```

### Core Endpoints

#### Organizations

```bash
# List all organizations
GET /api/admin/orgs

# Get organization details
GET /api/admin/orgs/:orgId

# Create organization
POST /api/admin/orgs
Body: { "name": "Org Name" }

# Update organization (role: platform_admin)
PUT /api/admin/orgs/:orgId
Body: { "name": "New Name", "settings": {...} }
```

#### Users

```bash
# List all users
GET /api/admin/users

# Get user profile
GET /api/user/profile

# Update user profile
PUT /api/user/profile
Body: {
  "full_name": "John Doe",
  "email": "john@example.com",
  "phone_number": "+1234567890"
}

# List user's organizations
GET /api/user/orgs
```

#### Billing

```bash
# List billing records
GET /api/admin/billing/records

# Create billing record
POST /api/admin/billing/records
Body: {
  "org_id": "uuid",
  "user_id": "uuid",
  "amount": 99.99,
  "type": "one_time",
  "description": "Setup fee",
  "currency": "USD"
}

# List invoices
GET /api/admin/billing/invoices

# Create invoice
POST /api/admin/billing/invoices
Body: {
  "org_id": "uuid",
  "amount": 999.99,
  "due_date": "2026-03-31",
  "items": [...]
}
```

#### Metrics

```bash
# Get organization metrics
GET /api/admin/orgs/:orgId/metrics

# Get call reports
GET /api/mightycall/reports?org_id=:orgId&date_range=today

# Get recordings
GET /api/orgs/:orgId/recordings

# Get SMS logs
GET /api/admin/mightycall/sms-logs?org_id=:orgId
```

#### Phone Numbers

```bash
# Assign phone to organization
POST /api/admin/orgs/:orgId/phone-numbers
Body: { "phoneNumberIds": ["uuid1", "uuid2"] }

# Unassign phone from organization
DELETE /api/admin/orgs/:orgId/phone-numbers/:phoneNumberId

# List organization phones
GET /api/orgs/:orgId/phone-numbers
```

---

## Troubleshooting

### Common Issues

#### 1. Can't Login

**Problem:** "Invalid credentials" error

**Solutions:**
1. Verify email is correct
2. Check CAPS LOCK
3. Reset password (Forgot Password link)
4. Verify account is activated
5. Contact admin if still issues

#### 2. Missing Data/Metrics

**Problem:** No call records or SMS messages showing

**Solutions:**
1. Check date filter (might be looking at wrong date)
2. Verify organization is selected
3. Verify phone numbers are assigned
4. Run manual sync: Admin → Operations → "Sync MightyCall Data"
5. Check that MightyCall API is connected

#### 3. Slow Performance

**Problem:** Dashboard or reports loading slowly

**Solutions:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Close unused tabs
3. Try different browser
4. Check internet connection
5. Contact admin to verify server performance

#### 4. Can't Access Admin Panel

**Problem:** "Access Denied" when visiting /admin

**Solutions:**
1. Verify you have admin role
2. Try logging out and back in
3. Clear browser cache
4. Contact admin to confirm role assignment

#### 5. SMS Not Sending

**Problem:** SMS send button disabled or error

**Solutions:**
1. Verify organization is selected
2. Verify phone number is valid format
3. Check that SMS integration is enabled
4. Verify account has SMS credits
5. Contact admin to check SMS service status

#### 6. Recordings Won't Play

**Problem:** Recording player shows error

**Solutions:**
1. Check browser audio settings
2. Try different browser
3. Check if recording file exists (check MightyCall)
4. Verify recording duration (empty recordings won't play)
5. Contact admin to check storage

---

## Support & Resources

### Getting Help

**For Users:**
1. Check this guide's troubleshooting section
2. Email support@yourdomain.com with:
   - Your name and email
   - What you were trying to do
   - Error message (if any)
   - Screenshot (if helpful)

**For Admins:**
1. Check MONITORING_APM_GUIDE.md for system issues
2. Review error logs (Admin → Operations → Logs)
3. Contact system administrator
4. Check uptime status at https://status.yourdomain.com

### Documentation Files

- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Deployment and hosting
- **[API_REFERENCE.md](API_REFERENCE.md)** - Complete API docs
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture
- **[NGINX_SSL_CONFIG.md](NGINX_SSL_CONFIG.md)** - SSL/TLS setup
- **[MONITORING_APM_GUIDE.md](MONITORING_APM_GUIDE.md)** - Monitoring setup

### Video Tutorials

- [Dashboard Overview](https://yourdomain.com/tutorial/dashboard)
- [Managing Organizations](https://yourdomain.com/tutorial/orgs)
- [Billing & Invoices](https://yourdomain.com/tutorial/billing)
- [Admin Panel Setup](https://yourdomain.com/tutorial/admin)

### FAQ

**Q: How often is data synced from MightyCall?**
A: Automatically every 5 minutes, or manually via Admin → Operations

**Q: Can I export reports?**
A: Yes! Click the download icon on any report page

**Q: How do I add multiple users at once?**
A: Use the CSV import feature in Admin → Users

**Q: What's the API rate limit?**
A: 1000 requests per minute per API key

**Q: How long are recordings kept?**
A: Configurable, default is 90 days (contact admin)

**Q: Can I integrate with other systems?**
A: Yes! API keys can be generated in Admin → API Keys

### Emergency Contacts

**System Down:**
- Email: emergency@yourdomain.com
- Phone: +1-xxx-xxx-xxxx
- Slack: #support-emergency

**Billing Issues:**
- Email: billing@yourdomain.com
- Portal: https://billing.yourdomain.com

**Security Issues:**
- Email: security@yourdomain.com
- Phone: +1-xxx-xxx-xxxx (confidential)

### Learning Path for New Users

**Week 1:**
- Day 1: Login and setup profile
- Day 2-3: Explore dashboard, understand KPIs
- Day 4-5: Learn reporting features
- Day 5: Generate first report

**Week 2:**
- Day 1-2: Learn SMS management
- Day 3-4: Explore recordings
- Day 5: Review billing basics

**Ongoing:**
- Monthly: Review new features
- Quarterly: Attend training session
- As needed: Review specific features

### Training Schedule

**New User Onboarding (Virtual)**
- Every Monday at 10 AM EST
- Duration: 1 hour
- Topics: Dashboard, reports, basics
- [Register here](https://yourdomain.com/training/register)

**Admin Certification (In-person or Virtual)**
- Monthly 3-day course
- Topics: Admin panel, billing, user management
- Prerequisites: 2 weeks of regular use
- [Apply here](https://yourdomain.com/admin-training/apply)

**Advanced Features Workshop**
- Bi-weekly sessions
- Topics: API, custom integrations, advanced reporting
- [Schedule](https://yourdomain.com/workshops)

---

**Last Updated:** February 2026
**Version:** 1.0.0
**Status:** Production Ready

For questions or suggestions, email: training@yourdomain.com
