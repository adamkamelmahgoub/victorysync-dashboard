# VictorySync Dashboard - Monitoring & APM Setup Guide

## Overview

This guide covers implementing comprehensive monitoring, logging, and Application Performance Monitoring (APM) for the VictorySync Dashboard.

## 1. Application Performance Monitoring (APM)

### Option 1: Datadog APM (Recommended for Production)

#### Installation

```bash
npm install --save dd-trace
```

#### Server Setup (server/src/index.ts - at top of file)

```typescript
// Must be imported first, before any other modules
import tracer from 'dd-trace';

tracer.init({
  hostname: process.env.DD_AGENT_HOST || 'localhost',
  port: process.env.DD_TRACE_AGENT_PORT || 8126,
  service: 'victorysync-dashboard',
  version: '1.0.0',
  env: process.env.NODE_ENV || 'production',
  logInjection: true,
  analytics: true,
});

// Rest of imports and server setup...
```

#### Docker Setup

Add Datadog agent sidecar to docker-compose.yml:

```yaml
services:
  datadog-agent:
    image: gcr.io/datadoghq/agent:latest
    environment:
      - DD_AGENT_HOST=datadog-agent
      - DD_TRACE_ENABLED=true
      - DD_TRACE_SAMPLE_RATE=0.1
      - DD_API_KEY=${DD_API_KEY}
      - DD_SITE=${DD_SITE:-datadoghq.com}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "8126:8126/udp"
    networks:
      - victorysync

  app:
    # ... existing config ...
    environment:
      - DD_TRACE_ENABLED=true
      - DD_AGENT_HOST=datadog-agent
      - DD_TRACE_AGENT_PORT=8126
    depends_on:
      - datadog-agent
```

#### Kubernetes Setup

```bash
# Install Datadog Operator
helm repo add datadog https://helm.datadoghq.com
helm install datadog datadog/datadog \
  --set datadog.apiKey=$DD_API_KEY \
  --set datadog.appKey=$DD_APP_KEY \
  --set datadog.apm.enabled=true \
  --set datadog.apm.socketPath=/var/run/datadog/apm.socket
```

### Option 2: New Relic APM

```bash
npm install newrelic
```

Create `newrelic.js`:

```javascript
exports.config = {
  app_name: ['victorysync-dashboard'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'info'
  },
  distributed_tracing: {
    enabled: true
  },
  transaction_events: {
    enabled: true
  }
};
```

### Option 3: Open Telemetry (Vendor-agnostic)

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/sdk-trace-node \
  @opentelemetry/exporter-jaeger @opentelemetry/instrumentation-http \
  @opentelemetry/instrumentation-express
```

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

const jaegerExporter = new JaegerExporter({
  host: process.env.JAEGER_HOST || 'localhost',
  port: parseInt(process.env.JAEGER_PORT || '6832'),
});

const sdk = new NodeSDK({
  traceExporter: jaegerExporter,
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
  ],
});

sdk.start();
```

## 2. Distributed Logging

### Option 1: Winston + Datadog

```bash
npm install winston winston-datadog
```

Create logging middleware:

```typescript
import winston from 'winston';
import DatadogWinston from 'winston-datadog';

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.json()
    }),
    new DatadogWinston({
      apiKey: process.env.DD_API_KEY,
      ddsource: 'nodejs',
      service: 'victorysync-dashboard',
      env: process.env.NODE_ENV,
      hostname: require('os').hostname(),
    })
  ]
});

// Use in Express middleware
app.use((req, res, next) => {
  logger.info({
    message: `${req.method} ${req.path}`,
    request_id: req.id,
    user_id: req.header('x-user-id'),
    timestamp: new Date().toISOString()
  });
  next();
});
```

### Option 2: Elasticsearch Stack (ELK)

docker-compose.yml additions:

```yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.0.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    networks:
      - victorysync

  kibana:
    image: docker.elastic.co/kibana/kibana:8.0.0
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    depends_on:
      - elasticsearch
    networks:
      - victorysync

  logstash:
    image: docker.elastic.co/logstash/logstash:8.0.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    environment:
      - "LS_JAVA_OPTS=-Xmx256m -Xms256m"
    depends_on:
      - elasticsearch
    networks:
      - victorysync
```

### Option 3: Splunk

Install Splunk Forwarder and configure log shipping:

```bash
# Forward application logs
./splunk add forward-server splunk-collector:9997 -auth admin:password
```

## 3. Metrics & Monitoring

### Prometheus + Grafana

#### Install Prometheus Client

```bash
npm install prom-client
```

#### Add Metrics Endpoint

```typescript
import promClient from 'prom-client';

// Create custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

// Middleware to track requests
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || 'unknown', res.statusCode)
      .observe(duration);
  });
  next();
});

// Metrics endpoint
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

#### Docker Compose

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
    networks:
      - victorysync

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
    depends_on:
      - prometheus
    networks:
      - victorysync

volumes:
  prometheus-data:
  grafana-data:
```

#### prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'victorysync-dashboard'
    static_configs:
      - targets: ['localhost:4000']
    metrics_path: '/metrics'
    scrape_interval: 5s
```

## 4. Error Tracking

### Sentry Integration

```bash
npm install @sentry/node @sentry/tracing
```

```typescript
import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  integrations: [
    new Sentry.Integrations.OnUncaughtException(),
    new Sentry.Integrations.OnUnhandledRejection(),
    new Tracing.Integrations.Express({
      app: true,
      request: true,
    }),
  ],
});

// Middleware
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// Error handler
app.use(Sentry.Handlers.errorHandler());
```

## 5. Real-time Alerting

### Datadog Monitors

```bash
# Create alert via Datadog API
curl -X POST https://api.datadoghq.com/api/v1/monitor \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{
    "type": "metric alert",
    "query": "avg:system.cpu{*}>0.8",
    "name": "High CPU on VictorySync",
    "message": "Alert on high CPU usage",
    "tags": ["env:prod"],
    "thresholds": {
      "critical": 0.8,
      "warning": 0.7
    }
  }'
```

### Alert Rules

1. **High Error Rate**: >5% 5xx errors in 5 minutes
2. **High Latency**: P95 response time > 2 seconds
3. **Database Connection Failures**: >10 per minute
4. **Memory Usage**: >80% for 5 minutes
5. **API Key Failures**: >20 per minute

## 6. Health Checks & Uptime Monitoring

### Built-in Health Endpoint

```typescript
// Add health check endpoint
app.get('/health', async (_req, res) => {
  try {
    // Check database connectivity
    const { error } = await supabaseAdmin.from('organizations').select('count');
    if (error) throw error;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err?.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

### Uptime Monitor (Datadog Synthetics)

```bash
# Monitor endpoint availability
curl -X POST https://api.datadoghq.com/api/v1/synthetics/tests \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -d '{
    "type": "api",
    "subtype": "http",
    "name": "VictorySync API Health Check",
    "request": {
      "method": "GET",
      "url": "https://yourdomain.com/health"
    },
    "assertions": [
      {
        "type": "statusCode",
        "operator": "is",
        "target": 200
      }
    ],
    "locations": ["aws:us-east-1", "aws:eu-west-1"],
    "frequency": 300
  }'
```

## 7. Performance Monitoring

### Frontend Performance

Add to client bundle:

```typescript
// client/src/lib/monitoring.ts
import { init as initSentry } from '@sentry/react';

initSentry({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});

// Monitor Core Web Vitals
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

### Database Query Monitoring

```typescript
// Log slow queries
const SLOW_QUERY_THRESHOLD = 1000; // 1 second

app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function(data) {
    const queryTime = res.getHeader('x-query-time');
    if (queryTime && parseInt(queryTime) > SLOW_QUERY_THRESHOLD) {
      logger.warn({
        message: 'Slow query detected',
        path: req.path,
        queryTime: queryTime,
        userId: req.header('x-user-id')
      });
    }
    return originalJson.call(this, data);
  };
  next();
});
```

## 8. Cost Tracking

### Monitor API Costs

```typescript
const apiCallCosts = new promClient.Counter({
  name: 'api_call_costs_usd',
  help: 'Estimated cost of API calls',
  labelNames: ['api_provider', 'endpoint']
});

// Track MightyCall API calls
app.use('/api/mightycall', (req, res, next) => {
  res.on('finish', () => {
    // Assume $0.001 per MightyCall API call
    apiCallCosts.labels('mightycall', req.path).inc(0.001);
  });
  next();
});
```

## 9. Dashboards

### Sample Grafana Dashboard

Create `grafana-dashboard.json`:

```json
{
  "dashboard": {
    "title": "VictorySync Dashboard",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [{
          "expr": "rate(http_request_duration_seconds_count[5m])"
        }]
      },
      {
        "title": "P95 Latency",
        "targets": [{
          "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds[5m]))"
        }]
      },
      {
        "title": "Error Rate",
        "targets": [{
          "expr": "rate(http_request_duration_seconds_count{status_code=~'5..'}[5m])"
        }]
      },
      {
        "title": "Active Connections",
        "targets": [{
          "expr": "active_connections"
        }]
      }
    ]
  }
}
```

## 10. Compliance & Audit Logging

### Audit Trail

```typescript
const auditLog = async (action: string, userId: string, resource: string, changes: any) => {
  await supabaseAdmin.from('audit_logs').insert({
    action,
    user_id: userId,
    resource,
    changes,
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
    timestamp: new Date().toISOString()
  });
};

// Use in sensitive operations
app.post('/api/admin/users/:userId/global-role', async (req, res) => {
  const { globalRole } = req.body;
  const userId = req.header('x-user-id');
  
  // ... perform update ...
  
  await auditLog('UPDATE_GLOBAL_ROLE', userId, `users:${req.params.userId}`, {
    oldRole: oldProfile.global_role,
    newRole: globalRole
  });
});
```

## Summary

- **APM**: Use Datadog, New Relic, or OpenTelemetry for performance monitoring
- **Logging**: Centralize logs with ELK Stack, Splunk, or cloud providers
- **Metrics**: Export Prometheus metrics for Grafana dashboards
- **Errors**: Track errors with Sentry
- **Alerts**: Set up actionable alerts for critical issues
- **Health**: Implement health checks for uptime monitoring
- **Audit**: Log all user actions for compliance
