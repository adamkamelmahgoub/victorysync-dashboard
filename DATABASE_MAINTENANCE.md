# VictorySync Dashboard - Database Maintenance Guide

**Status:** Production Ready ✅  
**Version:** 1.0.0  
**Database:** Supabase PostgreSQL  
**Audience:** Database Administrators

---

## Quick Reference

### Key Database Stats
- **Type:** PostgreSQL (Supabase)
- **Size:** Monitor via Supabase dashboard
- **Tables:** 30+
- **Connections:** Default 20, scalable
- **Backup:** Daily automatic (7-day retention)
- **RLS:** Enabled on all sensitive tables

### Essential Connections
- **Supabase URL:** `https://[project].supabase.co`
- **API URL:** `https://[project].supabase.co/rest/v1`
- **Realtime URL:** `wss://[project].supabase.co/realtime/v1`
- **Direct Access:** `psql postgresql://user:pass@db.supabase.co:5432/postgres`

---

## Database Architecture

### Core Tables

#### Organizations (Table: `organizations`)
```sql
-- Track all organizations using the platform
SELECT COUNT(*) FROM organizations;

-- Find org details
SELECT * FROM organizations 
WHERE id = '...'
LIMIT 1;

-- Archives per org
SELECT org_id, COUNT(*) as archive_count 
FROM archives 
GROUP BY org_id;
```

#### Users & Authentication
```sql
-- Profiles (linked to auth.users)
SELECT id, email, global_role 
FROM profiles 
LIMIT 10;

-- Organization users (with roles)
SELECT user_id, org_id, role 
FROM org_users 
WHERE org_id = '...'
LIMIT 20;

-- Check admin users
SELECT email, global_role 
FROM profiles 
WHERE global_role = 'platform_admin';
```

#### Phone Numbers & Assignments
```sql
-- All phone numbers in system
SELECT * FROM phone_numbers 
LIMIT 20;

-- Assigned phones per org
SELECT org_id, COUNT(*) as count 
FROM phone_numbers 
WHERE assigned_to_org = true 
GROUP BY org_id;

-- Find unassigned phones
SELECT * FROM phone_numbers 
WHERE assigned_to_org = false 
LIMIT 50;
```

#### Call & Recording Data
```sql
-- Recent calls
SELECT * FROM calls 
ORDER BY created_at DESC 
LIMIT 100;

-- Recording stats
SELECT COUNT(*) as total_recordings,
       COUNT(CASE WHEN duration > 0 THEN 1 END) as with_duration,
       AVG(duration) as avg_duration
FROM recordings;

-- Calls per org (month)
SELECT org_id, COUNT(*) 
FROM calls 
WHERE created_at > NOW() - INTERVAL '1 month'
GROUP BY org_id;
```

#### Billing Data
```sql
-- Billing records
SELECT * FROM billing_records 
WHERE org_id = '...'
ORDER BY created_at DESC
LIMIT 50;

-- Invoice summary
SELECT org_id, SUM(amount) as total, COUNT(*) 
FROM invoices 
WHERE status = 'paid'
GROUP BY org_id;

-- Revenue this month
SELECT SUM(amount) 
FROM billing_records 
WHERE created_at > DATE_TRUNC('month', NOW());
```

#### SMS Data
```sql
-- SMS logs
SELECT * FROM sms_messages 
ORDER BY created_at DESC 
LIMIT 100;

-- SMS per org
SELECT org_id, COUNT(*) as count,
       COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound,
       COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound
FROM sms_messages 
GROUP BY org_id;
```

---

## Daily Maintenance

### Morning Backup Verification
```bash
# Check backup status (in Supabase dashboard)
# Path: Project Settings → Backups

# Expected: Last backup completed within 24 hours
# Size: Should be similar to previous day ± 10%

# Restore test (quarterly only)
# Click "Restore" on oldest backup
# Verify table counts match current
```

### Monitor Slow Queries
```sql
-- View slow queries (> 1 second)
SELECT query, mean_time, calls
FROM pg_stat_statements
WHERE mean_time > 1000
ORDER BY mean_time DESC
LIMIT 10;

-- Reset stats
SELECT pg_stat_statements_reset();
```

### Check Database Size
```sql
-- Size by schema
SELECT schemaname, 
       ROUND(SUM(pg_total_relation_size(schemaname||'.'||tablename))/1024/1024) as size_mb
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
GROUP BY schemaname
ORDER BY size_mb DESC;

-- Size by table
SELECT tablename,
       ROUND(pg_total_relation_size('public.'||tablename)/1024/1024) as size_mb
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_mb DESC
LIMIT 20;
```

### Check Connections
```sql
-- Current connections
SELECT count(*) FROM pg_stat_activity;

-- Connections by state
SELECT state, count(*) 
FROM pg_stat_activity
GROUP BY state;

-- Long-running queries (> 5 min)
SELECT pid, usename, query, now() - query_start as duration
FROM pg_stat_activity
WHERE (now() - query_start) > interval '5 minutes';
```

---

## Weekly Maintenance

### Analyze and Vacuum
```sql
-- Analyze all tables (updates statistics)
ANALYZE;

-- Vacuum (reclaims dead tuples)
VACUUM ANALYZE;

-- These usually run automatically in PostgreSQL
-- But can force if needed
```

### Check Index Health
```sql
-- Unused indexes (consuming disk space)
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND indexname NOT LIKE 'pg_toast%'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Missing indexes (slow queries)
-- Review slow query log
-- Plan new indexes if needed

-- Reindex table (if corruption suspected)
-- REINDEX TABLE table_name;
```

### Verify RLS Policies
```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables
WHERE schemaname = 'public'
AND rowsecurity = false;
-- Should be empty (all tables have RLS)

-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, qual
FROM pg_policies
WHERE schemaname = 'public'
LIMIT 20;
```

### Data Consistency Checks
```sql
-- Orphaned records (phone_numbers without org)
SELECT * FROM phone_numbers 
WHERE assigned_to_org = true 
AND org_id NOT IN (SELECT id FROM organizations);

-- Users with deleted orgs
SELECT * FROM org_users 
WHERE org_id NOT IN (SELECT id FROM organizations);

-- Invoices with deleted orgs
SELECT * FROM invoices 
WHERE org_id NOT IN (SELECT id FROM organizations);
```

---

## Monthly Maintenance

### Performance Tuning
```sql
-- Reindex all tables
REINDEX DATABASE victorysync;

-- Update table statistics
ANALYZE;

-- Check table bloat (UPDATE/DELETE volume)
SELECT current_database(), 
       schemaname, 
       tablename,
       ROUND(100.0 * (CASE WHEN otta > 0 THEN sml.relpages - otta ELSE 0 END) / sml.relpages) AS table_waste_ratio
FROM pg_class
ORDER BY table_waste_ratio DESC
LIMIT 20;
```

### Archive Old Data
```sql
-- Archive calls older than 1 year
INSERT INTO call_archives
SELECT * FROM calls WHERE created_at < NOW() - INTERVAL '1 year';

DELETE FROM calls WHERE created_at < NOW() - INTERVAL '1 year';

-- Archive SMS older than 6 months
INSERT INTO sms_archives
SELECT * FROM sms_messages WHERE created_at < NOW() - INTERVAL '6 months';

DELETE FROM sms_messages WHERE created_at < NOW() - INTERVAL '6 months';

-- Vacuum to recover space
VACUUM ANALYZE;
```

### Backup Verification
```bash
# Verify latest backup size
# Supabase Dashboard → Settings → Backups

# Test restore to staging
# [ ] Create staging database copy
# [ ] Run restore process
# [ ] Verify all tables present
# [ ] Spot-check data integrity
# [ ] Drop staging database
```

### Generate Reports
```sql
-- Organizations summary
SELECT COUNT(*) as total_orgs,
       COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 month' THEN 1 END) as new_this_month,
       COUNT(CASE WHEN subscription_status = 'active' THEN 1 END) as active
FROM organizations;

-- User summary
SELECT COUNT(*) as total_users,
       COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 month' THEN 1 END) as new_this_month,
       COUNT(DISTINCT org_id) as org_count
FROM org_users;

-- Call statistics
SELECT COUNT(*) as total_calls,
       SUM(duration) as total_minutes,
       AVG(duration) as avg_duration,
       COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 day' THEN 1 END) as calls_today
FROM calls;

-- Revenue
SELECT SUM(amount) as total_revenue,
       COUNT(*) as total_records
FROM billing_records
WHERE status = 'paid';
```

---

## Handling Common Issues

### Issue #1: High Database Load

**Symptoms:**
```
- Slow queries
- Connection timeouts
- CPU usage > 80%
```

**Diagnosis:**
```sql
-- Find long-running queries
SELECT pid, usename, query, 
       NOW() - query_start as duration
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

-- Find most common queries
SELECT query, calls, mean_time, max_time
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;
```

**Solutions:**
1. **Kill long-running query**
   ```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE duration > interval '30 minutes';
   ```

2. **Optimize slow query**
   ```sql
   EXPLAIN ANALYZE SELECT ...;
   -- Add indexes if needed
   CREATE INDEX idx_name ON table(column);
   ```

3. **Scale database**
   - Supabase dashboard → Project Settings → Size
   - Upgrade compute plan

### Issue #2: Disk Space Running Low

**Symptoms:**
```
- "Disk full" errors
- Inserts/updates failing
```

**Diagnosis:**
```bash
# Check disk usage
SELECT pg_database.datname,
       pg_size_pretty(pg_database_size(pg_database.datname))
FROM pg_database;
```

**Solutions:**
1. **Archive old data**
   ```sql
   -- Move old calls to archive
   INSERT INTO call_archives
   SELECT * FROM calls 
   WHERE created_at < NOW() - INTERVAL '1 year';
   
   DELETE FROM calls 
   WHERE created_at < NOW() - INTERVAL '1 year';
   
   VACUUM ANALYZE;
   ```

2. **Upgrade storage**
   - Supabase dashboard → Settings → Storage
   - Increase storage limit

### Issue #3: Connection Pool Exhausted

**Symptoms:**
```
- "Max connections exceeded" errors
- Users unable to login
```

**Diagnosis:**
```sql
SELECT count(*) FROM pg_stat_activity;
SHOW max_connections;
```

**Solutions:**
1. **Check for idle connections**
   ```sql
   SELECT usename, count(*) 
   FROM pg_stat_activity
   WHERE state = 'idle'
   GROUP BY usename;
   
   -- Kill idle connections
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE state = 'idle' 
   AND query_start < NOW() - INTERVAL '30 minutes';
   ```

2. **Increase connection limit**
   - Supabase Dashboard → Project Settings → Database
   - Increase max_connections parameter

### Issue #4: RLS Policy Issues

**Symptoms:**
```
- Users seeing other orgs' data
- Permission denied errors
```

**Diagnosis:**
```sql
-- Check RLS policies
SELECT tablename, policyname, permissive, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- Test policy (as specific user)
SET SESSION AUTHORIZATION 'user-uuid';
SELECT * FROM calls LIMIT 1;
RESET SESSION AUTHORIZATION;
```

**Solutions:**
1. **Review RLS policy**
   ```sql
   DROP POLICY policy_name ON table_name;
   CREATE POLICY policy_name ON table_name
   USING (org_id = auth.uid()::text);
   ```

2. **Test policy**
   ```sql
   -- Enable policy logging
   SET log_statement = 'all';
   -- Run query and check logs
   SET log_statement = 'default';
   ```

---

## Data Migration Examples

### Add New Organization
```sql
INSERT INTO organizations (
  name, 
  subscription_status, 
  created_by
) VALUES (
  'New Org Name',
  'active',
  'admin-user-id'
) RETURNING id;
```

### Bulk Import Users
```sql
COPY org_users (id, org_id, user_id, role, created_at)
FROM STDIN WITH (FORMAT csv, HEADER)
\copy org_users FROM 'users.csv' WITH (FORMAT csv, HEADER)
```

### Fix Billing Record
```sql
UPDATE billing_records
SET amount = 99.99,
    status = 'paid',
    updated_at = NOW()
WHERE id = 'record-id';
```

### Merge Organizations
```sql
-- Merge org2 into org1
UPDATE org_users SET org_id = 'org1-id' 
WHERE org_id = 'org2-id';

UPDATE calls SET org_id = 'org1-id' 
WHERE org_id = 'org2-id';

UPDATE phone_numbers SET org_id = 'org1-id' 
WHERE org_id = 'org2-id';

DELETE FROM organizations WHERE id = 'org2-id';
```

---

## Backup & Disaster Recovery

### Manual Backup
```bash
# Via Supabase Dashboard
# Settings → Backups → Create Backup

# Via CLI
supabase db backup create --project-id xxxxx

# Via PostgreSQL
pg_dump postgresql://user:pass@host/db > backup.sql

# Full restore
psql postgresql://user:pass@host/db < backup.sql
```

### Point-in-Time Recovery
```bash
# Supabase provides 7-day retention
# Dashboard → Settings → Backups
# Select backup timestamp
# Click "Restore"
```

---

## Performance Monitoring

### Key Metrics to Track
```
- Connections used / max connections
- Slow queries (> 1 second)
- Table bloat ratio
- Disk space used / available
- RLS policy efficiency
- Query response times
```

### Create Custom Monitoring
```sql
-- Create monitoring table
CREATE TABLE db_metrics (
  id SERIAL PRIMARY KEY,
  metric_name TEXT,
  metric_value FLOAT,
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Log metrics daily
INSERT INTO db_metrics (metric_name, metric_value)
SELECT 'connections', COUNT(*) 
FROM pg_stat_activity;
```

---

## Security Checks

### Verify RLS Enabled
```sql
-- All tables should have rowsecurity = true
SELECT tablename, rowsecurity 
FROM pg_tables
WHERE schemaname = 'public';
```

### Check User Permissions
```sql
-- Users should not have superuser
SELECT usename, usesuper, usecreatedb
FROM pg_user
WHERE usename NOT LIKE 'pg_%';
```

### Audit Foreign Keys
```sql
-- Ensure referential integrity
SELECT constraint_name, table_name, column_name
FROM information_schema.key_column_usage
WHERE table_schema = 'public'
ORDER BY table_name;
```

---

## Contact & Escalation

```
DATABASE ADMIN:       [Name] [Phone] [Slack]
SECONDARY DBA:        [Name] [Phone] [Slack]
SUPABASE SUPPORT:     support@supabase.com
POSTGRES DOCS:        https://www.postgresql.org/docs/
```

---

**Database Maintenance Guide v1.0**  
**Last Updated:** February 2026  
**Next Review:** August 2026
