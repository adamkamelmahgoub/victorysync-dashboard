# Nginx Configuration for VictorySync Dashboard with SSL/TLS

## Production-ready nginx configuration

This configuration provides:
- HTTPS/SSL termination
- HTTP redirect to HTTPS
- Gzip compression
- Security headers
- Reverse proxy to Node.js backend
- Static asset caching

## SSL Certificate Setup

### Option 1: Let's Encrypt (Free, Recommended)

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx -y

# Generate certificate
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  -d api.yourdomain.com \
  --email admin@yourdomain.com \
  --agree-tos \
  --non-interactive

# Certificates will be in:
# /etc/letsencrypt/live/yourdomain.com/
```

### Option 2: AWS Certificate Manager (If using AWS)

```bash
# Request certificate in AWS console
# Then update nginx to use:
# - Certificate from ALB/CloudFront instead of nginx
```

### Option 3: Commercial SSL Certificate

1. Purchase from provider (Comodo, DigiCert, GoDaddy, etc.)
2. Generate CSR and private key
3. Upload in nginx configuration below

## Auto-renewal with Let's Encrypt

```bash
# Setup cron job for auto-renewal
sudo crontab -e

# Add line:
# 0 2 * * * certbot renew --quiet && nginx -s reload
```

## Nginx Configuration File

Create `/etc/nginx/sites-available/victorysync`:

```nginx
# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com api.yourdomain.com;
    
    # Allow Let's Encrypt validation
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS - Main Application
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Modern SSL configuration (https://ssl-config.mozilla.org/)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' *.supabase.co *.mightycall.com;" always;
    
    # Logging
    access_log /var/log/nginx/victorysync-access.log combined;
    error_log /var/log/nginx/victorysync-error.log warn;
    
    # Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;
    gzip_comp_level 6;
    
    # Client limits
    client_max_body_size 10M;
    
    # Proxy settings for Node.js backend
    upstream app_backend {
        least_conn;
        server localhost:4000 max_fails=3 fail_timeout=30s;
        # Add more backend servers for load balancing:
        # server localhost:4001 max_fails=3 fail_timeout=30s;
        # server localhost:4002 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }
    
    # Static assets with long cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://app_backend;
        proxy_cache_valid 200 30d;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        add_header Cache-Control "public, immutable, max-age=2592000";
        expires 30d;
    }
    
    # API endpoints (no caching)
    location /api/ {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;
        
        # Timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Disable caching for API
        proxy_no_cache 1;
        proxy_cache_bypass 1;
    }
    
    # All other requests go to backend
    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;
        
        # WebSocket support
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://app_backend;
        access_log off;
    }
}

# API subdomain (optional)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    upstream api_backend {
        server localhost:4000;
    }
    
    location / {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Enable Configuration

```bash
# Create symlink to sites-enabled
sudo ln -s /etc/nginx/sites-available/victorysync /etc/nginx/sites-enabled/

# Disable default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

## DNS Configuration

Configure your domain DNS records:

```
# A Record
yourdomain.com          A       <your-server-ip>
www.yourdomain.com      A       <your-server-ip>
api.yourdomain.com      A       <your-server-ip>

# Or if using CloudFront/CDN:
yourdomain.com          CNAME   d1234.cloudfront.net
```

## AWS CloudFront Setup (CDN)

1. **Create CloudFront Distribution:**
   - Origin: Your nginx server
   - Origin Protocol: HTTPS
   - Viewer Protocol: Redirect HTTP to HTTPS

2. **SSL/TLS Certificate in CloudFront:**
   - Request certificate in ACM
   - Add to CloudFront distribution

3. **Update DNS:**
   ```
   yourdomain.com  CNAME  d1234.cloudfront.net
   ```

## Monitoring SSL Certificate Expiry

```bash
# Check certificate expiry
openssl x509 -enddate -noout -in /etc/letsencrypt/live/yourdomain.com/cert.pem

# Monitor with Prometheus
# Add to prometheus.yml:
# - job_name: ssl-cert-expiry
#   metrics_path: /probe
#   static_configs:
#     - targets:
#       - yourdomain.com:443
#       - www.yourdomain.com:443
```

## Troubleshooting

### Certificate not renewing
```bash
# Test renewal
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal
```

### SSL Labs Grade Check
https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com

### nginx configuration errors
```bash
# Detailed error logging
sudo nginx -t -v

# View logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/victorysync-access.log
```

## Performance Optimization

1. **Enable HTTP/2 Push:**
   ```nginx
   http2_push_preload on;
   ```

2. **Enable TLS 1.3 0-RTT:**
   ```nginx
   ssl_early_data on;
   ```

3. **Enable OCSP Stapling:**
   - Reduces latency by avoiding OCSP responder calls

4. **Enable Brotli Compression (better than gzip):**
   ```nginx
   brotli on;
   brotli_types text/plain text/css text/xml text/javascript application/json;
   brotli_comp_level 6;
   ```
