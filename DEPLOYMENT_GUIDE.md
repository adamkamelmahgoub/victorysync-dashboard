# VictorySync Dashboard - Deployment Guide

## Quick Start (Docker)

### Prerequisites
- Docker and Docker Compose installed
- Supabase project configured
- MightyCall API credentials
- Environment variables configured

### Local Development with Docker

1. **Create .env file from template:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

2. **Build and start the application:**
```bash
docker-compose up --build
```

3. **Access the application:**
```
http://localhost:4000
```

### Production Deployment

#### Option 1: Docker Hub / Container Registry

1. **Build the Docker image:**
```bash
docker build -t victorysync-dashboard:latest .
docker tag victorysync-dashboard:latest your-registry/victorysync-dashboard:latest
docker push your-registry/victorysync-dashboard:latest
```

2. **Deploy with Docker:**
```bash
docker run -d \
  --name victorysync \
  -p 4000:4000 \
  --env-file .env \
  your-registry/victorysync-dashboard:latest
```

#### Option 2: Kubernetes

1. **Create ConfigMap and Secrets:**
```bash
kubectl create configmap victorysync-config \
  --from-literal=NODE_ENV=production \
  --from-literal=VITE_API_BASE_URL=https://your-domain.com

kubectl create secret generic victorysync-secrets \
  --from-literal=SUPABASE_SERVICE_KEY=your-key \
  --from-literal=MIGHTYCALL_API_KEY=your-key
```

2. **Deploy with Kubernetes manifest:**
```bash
kubectl apply -f k8s-deployment.yaml
```

#### Option 3: AWS ECS/Fargate

1. **Push to ECR:**
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin your-account.dkr.ecr.us-east-1.amazonaws.com
docker tag victorysync-dashboard:latest your-account.dkr.ecr.us-east-1.amazonaws.com/victorysync:latest
docker push your-account.dkr.ecr.us-east-1.amazonaws.com/victorysync:latest
```

2. **Create ECS service with task definition**

#### Option 4: Heroku

1. **Install Heroku CLI and login:**
```bash
heroku login
heroku create your-app-name
```

2. **Set environment variables:**
```bash
heroku config:set VITE_SUPABASE_URL=... \
  VITE_SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_KEY=... \
  MIGHTYCALL_API_KEY=...
```

3. **Deploy:**
```bash
git push heroku main
```

#### Option 5: DigitalOcean App Platform

1. **Create app spec (app.yaml):**
```yaml
name: victorysync-dashboard
services:
- name: web
  github:
    repo: your-org/victorysync-dashboard
    branch: main
  build_command: npm run build
  http_port: 4000
  envs:
  - key: NODE_ENV
    value: production
  - key: VITE_SUPABASE_URL
    scope: RUN_AND_BUILD_TIME
    value: ${SUPABASE_URL}
```

2. **Deploy:**
```bash
doctl apps create --spec app.yaml
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | 'production' or 'development' |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `MIGHTYCALL_API_KEY` | Yes | MightyCall API key |
| `VITE_API_BASE_URL` | No | API base URL (default: http://localhost:4000) |
| `APP_PORT` | No | Port to run on (default: 4000) |
| `LOG_LEVEL` | No | Logging level (default: info) |

### Health Checks

The Docker image includes a health check endpoint at `GET /` that returns 200 OK.

```bash
curl http://localhost:4000/
# Response: "VictorySync metrics API is running"
```

### Monitoring

#### Logs
```bash
# Docker
docker logs victorysync

# Docker Compose
docker-compose logs -f app

# Kubernetes
kubectl logs deployment/victorysync-dashboard -f
```

#### Metrics
The application exposes metrics at `/metrics` (if Prometheus integration is enabled)

### Troubleshooting

#### Application won't start
1. Check environment variables: `docker inspect victorysync | grep Env`
2. Check logs: `docker logs victorysync`
3. Verify Supabase connectivity
4. Verify MightyCall API access

#### Port already in use
```bash
# Docker
docker run -p 8000:4000 ...

# Or kill existing process
lsof -i :4000
kill -9 <PID>
```

#### Database connection issues
1. Verify `SUPABASE_SERVICE_KEY` is correct
2. Verify `SUPABASE_URL` is accessible
3. Check firewall rules

### Security Recommendations

1. **Use HTTPS in production**
   - Use nginx reverse proxy with SSL
   - Or use AWS ALB with SSL termination

2. **Secure environment variables**
   - Never commit .env files
   - Use cloud provider secret management (AWS Secrets Manager, Azure Key Vault, etc.)
   - Rotate API keys regularly

3. **Network security**
   - Use VPN for database access
   - Implement WAF rules
   - Use security groups/network policies

4. **Application security**
   - Keep dependencies updated
   - Run security audits: `npm audit`
   - Use Content Security Policy headers

### Scaling

#### Horizontal Scaling
The application is stateless and can scale horizontally:
- Multiple instances behind a load balancer
- Use environment variables to point to shared Supabase instance
- Use Redis for session management (if needed)

#### Vertical Scaling
- Increase container memory limits
- Optimize database queries
- Enable caching

### Backup & Recovery

1. **Database backups**
   - Supabase handles automated backups
   - Enable point-in-time recovery in Supabase dashboard

2. **Configuration backups**
   - Store .env files securely
   - Version control infrastructure-as-code

### Rollback Procedure

#### Docker
```bash
docker pull your-registry/victorysync-dashboard:v1.0.0
docker stop victorysync
docker run -d --name victorysync ... your-registry/victorysync-dashboard:v1.0.0
```

#### Kubernetes
```bash
kubectl rollout history deployment/victorysync-dashboard
kubectl rollout undo deployment/victorysync-dashboard
```

### Performance Optimization

1. **Enable compression:**
   - Nginx: `gzip on;`
   - Express: Already enabled in server

2. **Cache static assets:**
   - Client: Built-in Vite caching
   - CDN: Serve from CloudFront/Cloudflare

3. **Database optimization:**
   - Add indexes for frequently queried fields
   - Optimize queries in Supabase SQL Editor

### Support

For deployment issues:
1. Check logs: `docker logs victorysync`
2. Verify environment variables
3. Test Supabase connectivity
4. Review GitHub Issues
