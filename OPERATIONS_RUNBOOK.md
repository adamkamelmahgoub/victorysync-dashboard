# VictorySync Dashboard - Operations & Runbook

**Status:** Production Ready ✅  
**Version:** 1.0.0  
**Last Updated:** February 2026  
**Audience:** Operations Team

---

## Quick Reference

### Essential Links
- **Dashboard:** https://yourdomain.com
- **Admin Panel:** https://yourdomain.com/admin
- **Health Check:** https://yourdomain.com/health
- **API Base:** https://yourdomain.com/api
- **Status Page:** https://status.yourdomain.com

### Critical Contacts
- **On-Call DevOps:** [phone/slack]
- **Database Admin:** [phone/slack]
- **Security Lead:** [phone/slack]
- **SRE Team:** [channel/email]

---

## Daily Operations

### Morning Checklist (8 AM)

```bash
# 1. System Health
curl -s https://yourdomain.com/health | jq .

# 2. Error Rate Check (Datadog/Sentry)
# Look for > 0.1% error rate
# Review critical errors
# Check 5xx error count

# 3. Performance Check
# Verify P95 latency < 500ms
# Check database connection pool
# Monitor memory usage < 80%

# 4. Backup Status
# Confirm nightly backup completed
# Check backup storage available
# Verify restore capability

# 5. Security Audit
# Check for unauthorized API calls
# Review audit logs (no suspicious activities)
# Verify SSL certificate valid
```

### Continuous Monitoring

**Auto Alerts Setup:**
- High error rate (>5% 5xx)
- High latency (P95 > 2 seconds)
- Database connection failures (>10/min)
- Memory usage (>85%)
- Disk space (>90% used)
- Certificate expiry (<7 days)

**Manual Checks Every Hour:**
- Health endpoint responding
- No new critical errors
- Response times stable
- User login working

---

## Common Issues & Solutions

### Issue #1: High Error Rate

**Symptoms:**
```
- Datadog shows > 1% 5xx errors
- Users reporting errors
- Support tickets increasing
```

**Diagnosis:**
```bash
# Check error logs
curl -H "x-user-id: admin" \
  https://yourdomain.com/api/admin/orgs

# Check database
# SELECT COUNT(*) FROM organizations;

# Check MightyCall sync
# Last sync time in logs

# Check resource usage
docker stats victorysync
```

**Solutions (in order):**
1. **Restart Application**
   ```bash
   docker restart victorysync
   # or
   kubectl rollout restart deployment/victorysync-dashboard
   # or
   sudo systemctl restart victorysync
   ```

2. **Check Database**
   - Verify Supabase is responding
   - Check connection pool
   - Look for slow queries

3. **Scale Up**
   ```bash
   # Kubernetes: increase replicas
   kubectl scale deployment victorysync-dashboard --replicas=4
   ```

4. **Investigate Root Cause**
   - Review Sentry errors
   - Check MightyCall API status
   - Review server logs

5. **Escalate to Dev Team**

### Issue #2: Slow Performance

**Symptoms:**
```
- Dashboard load > 3 seconds
- API responses > 1 second
- User complaints about sluggishness
```

**Diagnosis:**
```bash
# Check resource usage
docker stats victorysync

# Check database performance
# In Supabase console: Logs → Slow queries

# Check network latency
curl -w "@curl-format.txt" https://yourdomain.com
```

**Solutions:**
1. **Clear Cache**
   ```bash
   # Invalidate CDN cache (if using CloudFront)
   aws cloudfront create-invalidation \
     --distribution-id XXXXX \
     --paths "/*"
   ```

2. **Optimize Database Queries**
   - Add missing indexes
   - Optimize slow queries
   - Archive old data

3. **Scale Resources**
   ```bash
   # Increase container resources
   kubectl set resources deployment victorysync-dashboard \
     --limits=cpu=2,memory=2Gi
   ```

4. **Enable Caching**
   - CDN (CloudFront/Cloudflare)
   - Redis for sessions
   - Client-side caching

### Issue #3: Database Connection Issues

**Symptoms:**
```
- "Database connection refused" errors
- Queries timing out
- Connection pool exhausted
```

**Diagnosis:**
```bash
# Check Supabase status
# Visit: https://status.supabase.com

# Test connection
psql "postgresql://user:pass@host/db" -c "SELECT 1"

# Check connection pool
# In Supabase: Database → Connections
```

**Solutions:**
1. **Verify Credentials**
   ```bash
   echo $SUPABASE_SERVICE_KEY
   echo $SUPABASE_URL
   # Verify not expired
   ```

2. **Restart Connection Pool**
   ```bash
   docker restart victorysync
   ```

3. **Increase Pool Size**
   - Update PGPOOL_NUM_INIT_CHILDREN
   - Restart application

4. **Contact Database Team**
   - Check Supabase status
   - Request increased connections

### Issue #4: Real-time Updates Not Working

**Symptoms:**
```
- Data not updating without page refresh
- Real-time subscriptions failing
- Browser console shows WebSocket errors
```

**Diagnosis:**
```bash
# Check Supabase Realtime status
# Visit: https://status.supabase.com

# Check browser console
# Look for WebSocket connection errors

# Verify Realtime enabled
# In Supabase: Project Settings → Realtime
```

**Solutions:**
1. **Restart Realtime Service**
   - Supabase dashboard → Realtime
   - Click "Restart"

2. **Clear Browser Cache**
   - Ctrl+Shift+Delete
   - Clear all cached data
   - Reload page

3. **Check Network**
   - Verify WebSocket port 443 open
   - Check firewall rules
   - Check proxy settings

### Issue #5: SSL Certificate Issues

**Symptoms:**
```
- Browser shows certificate warning
- "HTTPS not secure" message
- Users unable to connect
```

**Diagnosis:**
```bash
# Check certificate expiry
openssl x509 -enddate -noout \
  -in /etc/letsencrypt/live/yourdomain.com/cert.pem

# Check certificate validity
openssl verify \
  /etc/letsencrypt/live/yourdomain.com/fullchain.pem

# Check Nginx config
sudo nginx -t
```

**Solutions:**
1. **Renew Certificate (if expiring soon)**
   ```bash
   sudo certbot renew --force-renewal
   sudo systemctl reload nginx
   ```

2. **Fix Certificate Issues**
   ```bash
   # If using wrong certificate
   sudo certbot certonly --standalone \
     -d yourdomain.com \
     -d www.yourdomain.com
   ```

3. **Update Nginx Config**
   ```bash
   sudo vim /etc/nginx/sites-available/victorysync
   # Verify correct cert paths
   sudo nginx -t && sudo systemctl reload nginx
   ```

---

## Maintenance Tasks

### Daily
- [ ] Review error logs (morning + evening)
- [ ] Check backup completion
- [ ] Monitor error rate
- [ ] Verify SSL certificate status

### Weekly
- [ ] Review slow queries log
- [ ] Check disk space usage
- [ ] Verify security logs
- [ ] Test backup restore

### Monthly
- [ ] Update dependencies
- [ ] Security patching
- [ ] Performance optimization
- [ ] Capacity planning review

### Quarterly
- [ ] Full security audit
- [ ] Database optimization
- [ ] Disaster recovery drill
- [ ] Load testing

### Annually
- [ ] Compliance audit
- [ ] Architecture review
- [ ] Training updates
- [ ] Cost optimization

---

## Deployment Procedure

### Pre-Deployment (2 hours before)
```bash
# [ ] Create database backup
# [ ] Notify stakeholders
# [ ] Prepare rollback plan
# [ ] Review change log

# [ ] Test in staging
npm run build
docker build -t victorysync-dashboard:staging .
docker run --env-file .env.staging victorysync-dashboard:staging
```

### Deployment (30 min window)
```bash
# [ ] Docker deployment
docker build -t victorysync-dashboard:1.0.0 .
docker tag victorysync-dashboard:1.0.0 registry/victorysync:1.0.0
docker push registry/victorysync:1.0.0
docker stop victorysync
docker run -d --name victorysync \
  -p 4000:4000 \
  --env-file .env \
  registry/victorysync:1.0.0

# [ ] Or Kubernetes deployment
kubectl apply -f k8s-deployment.yaml
kubectl rollout status deployment/victorysync-dashboard
```

### Post-Deployment (30 min monitoring)
```bash
# [ ] Health check
curl https://yourdomain.com/health

# [ ] Smoke tests
curl https://yourdomain.com/
curl https://yourdomain.com/api/admin/orgs

# [ ] Verify in Datadog
# Look for: no error spike, latency stable

# [ ] User notification
# Post to Slack: "Deployment complete"
```

---

## Rollback Procedure

### Quick Rollback (If critical issue)
```bash
# Docker
docker stop victorysync
docker run -d --name victorysync \
  -p 4000:4000 \
  --env-file .env \
  registry/victorysync:0.9.0

# Kubernetes
kubectl rollout undo deployment/victorysync-dashboard

# Traditional
cd /opt/victorysync && git checkout v0.9.0
sudo systemctl restart victorysync
```

### Post-Rollback
```bash
# [ ] Verify health
curl https://yourdomain.com/health

# [ ] Check error rate
# Should return to normal within 2 minutes

# [ ] Notify team
# Post to Slack with root cause

# [ ] Open incident report
# For post-mortem analysis
```

---

## Monitoring Dashboards

### Datadog Dashboards
1. **Overview:** https://app.datadoghq.com/dash/...
   - Error rate, latency, throughput
   - System resources (CPU, memory, disk)
   - Database performance

2. **Alerts:** https://app.datadoghq.com/monitors
   - Check for firing alerts
   - Acknowledge critical issues
   - Review alert history

### Grafana Dashboards (if using)
1. **Application:** http://grafana:3000
   - Request rate
   - P95 latency
   - Error rate
   - Active connections

2. **Infrastructure:**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network traffic

### Sentry Error Tracking
1. **Errors:** https://sentry.io/organizations/.../issues/
   - New errors
   - Error frequency
   - Affected users
   - Stack traces

---

## Logging & Debugging

### View Application Logs
```bash
# Docker
docker logs victorysync
docker logs -f victorysync  # Follow logs
docker logs --tail 100 victorysync

# Kubernetes
kubectl logs deployment/victorysync-dashboard
kubectl logs -f pod/victorysync-dashboard-xxxxx

# Traditional
sudo journalctl -u victorysync -n 100
sudo journalctl -u victorysync -f  # Follow
```

### Check System Resources
```bash
# Docker
docker stats victorysync

# Kubernetes
kubectl top pods -n victorysync

# Traditional
top
htop
df -h  # Disk space
```

### Test API Endpoints
```bash
# Health check
curl -i https://yourdomain.com/health

# Admin endpoint
curl -i -H "x-user-id: admin-user-id" \
  https://yourdomain.com/api/admin/orgs

# Get logs from Datadog
datadog_api_client.monitoring.search_logs(...)
```

---

## Disaster Recovery

### Database Backup/Restore
```bash
# Backup (automatic via Supabase)
# Manual backup via Supabase dashboard

# Restore
# Supabase dashboard → Database → Backups
# Click "Restore" on desired backup

# Verify restore
SELECT COUNT(*) FROM organizations;
SELECT COUNT(*) FROM billing_records;
```

### Application Disaster Recovery
```bash
# Scenario: Complete application failure
# [ ] Notify stakeholders
# [ ] Restore from backup
# [ ] Verify data integrity
# [ ] Perform smoke tests
# [ ] Monitor for issues

# RTO (Recovery Time Objective): 15 min
# RPO (Recovery Point Objective): 5 min (backup frequency)
```

---

## Escalation Procedure

### Level 1: Ops Team
- Check application logs
- Verify system resources
- Restart services if needed
- Notify Level 2 if issue persists

### Level 2: DevOps/SRE
- Investigate root cause
- Scale resources if needed
- Review monitoring data
- Plan fix or rollback

### Level 3: Development Team
- Review code changes
- Identify bugs
- Prepare hotfix
- Deploy fix

### Level 4: Executive Escalation
- If RTO exceeded (15 min)
- If customer impact significant
- If security incident
- Notify C-level stakeholders

---

## Useful Commands Reference

```bash
# System Status
docker ps
docker stats
docker logs victorysync

# Database
psql -h host -U user -d db -c "SELECT 1;"
SHOW max_connections;

# Network
curl -i https://yourdomain.com/health
netstat -an | grep 4000
nslookup yourdomain.com

# Certificate
openssl x509 -enddate -noout -in cert.pem
openssl verify fullchain.pem

# Backup
docker exec victorysync tar czf backup.tar.gz /data/
```

---

## Contact Information

```
ON-CALL:             [Name] [Phone] [Slack]
SECONDARY:           [Name] [Phone] [Slack]
DATABASE ADMIN:      [Name] [Phone] [Slack]
SECURITY LEAD:       [Name] [Phone] [Slack]
EXECUTIVE ESCALATION: [Name] [Phone] [Email]

INCIDENT RESPONSE:   incidents@company.com
STATUS PAGE:         https://status.yourdomain.com
SUPPORT PORTAL:      https://support.yourdomain.com
```

---

**Operations Runbook v1.0**  
**Last Updated:** February 2026  
**Next Review:** August 2026

**Questions?** Contact: ops-team@company.com
