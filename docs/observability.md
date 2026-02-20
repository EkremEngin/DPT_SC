# Observability Strategy - Phase 5.4

**Phase:** 5.4 Observability Maturity  
**Status:** ✅ Implemented  
**Date:** 2025-02-18

---

## Overview

This document outlines the observability maturity implementation for the DPT-Local application. The strategy focuses on three pillars: **Metrics**, **Logging**, and **Health Monitoring** - all implemented with zero external dependencies for maximum reliability.

---

## 1. Metrics Collection

### 1.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Metrics Flow                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  HTTP Request → metricsMiddleware → recordRequest()              │
│       ↓              ↓                   ↓                        │
│  Timing          Route Pattern      Latency Buckets              │
│  Status Code     Extraction          Error Count                 │
│                                                                   │
│  DB Query → db/index.ts → recordDbQuery()                        │
│       ↓              ↓                   ↓                        │
│  Query Time      Query Type          Slow Query Detection        │
│                                                                   │
│  Snapshot → /metrics endpoint                                    │
│       ↓              ↓                   ↓                        │
│  JSON Format     Prometheus Format    Summary Format              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Metrics Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/metrics` | GET | Required | Full metrics JSON snapshot |
| `/metrics?format=prometheus` | GET | Required | Prometheus text format for scraping |
| `/metrics?format=summary` | GET | Required | Per-route summary |
| `/metrics/reset` | POST | Admin only | Reset all metrics |
| `/health` | GET | Public | Health check with alert status |

### 1.3 Latency Buckets

Requests are categorized into latency buckets for p95/p99 calculations:

| Bucket | Threshold | Use Case |
|--------|-----------|----------|
| `50` | <50ms | Fast requests (cached, simple queries) |
| `100` | <100ms | Normal requests |
| `200` | <200ms | Acceptable requests |
| `500` | <500ms | Slow requests |
| `overflow` | ≥500ms | Very slow requests (investigate) |

### 1.4 Database Metrics

All database queries are automatically tracked:

```typescript
// Example query metrics
{
  queryCount: 1523,
  totalQueryTime: 42150,      // ms
  maxQueryTime: 245,          // ms
  slowQueries: 12             // queries >100ms
}
```

### 1.5 Alert Thresholds

| Alert | Threshold | Severity |
|-------|-----------|----------|
| High Error Rate | >5% errors | Critical |
| High Latency | p95 >500ms | Warning |
| High Memory | >500MB heap | Warning |
| Slow Queries | >5 queries >100ms | Warning |

---

## 2. Logging Strategy

### 2.1 Log Levels

| Level | Retention | Use Case |
|-------|-----------|----------|
| **FATAL** | 90 days | Application crashes, exits |
| **ERROR** | 90 days | Request failures, exceptions |
| **WARN** | 30 days | Degradation, slow queries |
| **INFO** | 14 days | Request completion, state changes |
| **DEBUG** | 3 days | Development only |
| **TRACE** | 3 days | Verbose debugging |

### 2.2 Structured Fields

All logs include:

```json
{
  "level": "info",
  "time": "2025-02-18T19:30:00.000Z",
  "service": "dpt-local-api",
  "environment": "production",
  "reqId": "abc-123-def",
  "userId": "user-123",
  "route": "/api/companies",
  "statusCode": 200,
  "latency": 45
}
```

### 2.3 Sensitive Data Redaction

The following fields are automatically redacted:

- `req.headers.authorization` → `***REDACTED***`
- `req.headers.cookie` → `***REDACTED***`
- `req.body.password` → `***REDACTED***`
- `req.body.token` → `***REDACTED***`
- `req.body.jwt` → `***REDACTED***`

---

## 3. Request Tracing

### 3.1 Request ID Correlation

Each HTTP request receives a unique `requestId` via [`requestIdMiddleware`](../server/src/middleware/requestId.ts):

```typescript
// Request header: X-Request-ID (optional, client-provided)
// Auto-generated if missing: UUID v4 format
```

### 3.2 Distributed Tracing Pattern

All logs for a single request share the same `reqId`:

```
19:30:00.123 INFO [reqId=abc-123] Incoming GET /api/companies
19:30:00.145 INFO [reqId=abc-123] DB query completed in 22ms
19:30:00.167 INFO [reqId=abc-123] Response sent: 200 OK (44ms)
```

---

## 4. Implementation Files

| File | Purpose |
|------|---------|
| [`server/src/utils/metrics.ts`](../server/src/utils/metrics.ts) | Core metrics collector class |
| [`server/src/middleware/metricsMiddleware.ts`](../server/src/middleware/metricsMiddleware.ts) | Express middleware for request timing |
| [`server/src/utils/logger.ts`](../server/src/utils/logger.ts) | Pino structured logger configuration |
| [`server/src/db/index.ts`](../server/src/db/index.ts) | Database query timing wrapper |
| [`server/src/index.ts`](../server/src/index.ts) | Metrics middleware registration |

---

## 5. Usage Examples

### 5.1 Fetch Metrics

```bash
# Get full metrics snapshot
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/metrics

# Get Prometheus format for scraping
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/metrics?format=prometheus"

# Get route summary
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/metrics?format=summary"
```

### 5.2 Health Check

```bash
# Public endpoint (no auth)
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-02-18T19:30:00.000Z",
  "uptime": 86400,
  "alerts": {
    "highErrorRate": "OK",
    "highLatency": "OK",
    "highMemory": "OK",
    "slowQueries": "OK"
  },
  "metrics": {
    "totalRequests": 15234,
    "errorRate": "1.2%",
    "memoryMB": 245.3,
    "dbQueries": 4521
  }
}
```

### 5.3 Reset Metrics (Admin)

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/metrics/reset
```

---

## 6. Monitoring Best Practices

### 6.1 Dashboard Metrics to Track

1. **Error Rate**: Should be <5% consistently
2. **p95 Latency**: Should be <500ms for all endpoints
3. **Memory Usage**: Alert if >500MB sustained
4. **Slow Queries**: Investigate if >5 in 15min window

### 6.2 Alerting Rules

```
ALERT HighErrorRate
  IF errorRate > 5%
  FOR 5 minutes
  SEVERITY critical

ALERT HighLatency
  IF p95Latency > 500ms
  FOR 10 minutes
  SEVERITY warning

ALERT MemoryLeak
  IF memoryUsageMB > 500
  FOR 15 minutes
  SEVERITY warning
```

### 6.3 Log Query Examples

```bash
# Find all errors in last hour
jq 'select(.level == "error")' logs/app.log

# Find slow requests (>1000ms)
jq 'select(.latency > 1000)' logs/app.log

# Trace a single request by ID
jq 'select(.reqId == "abc-123")' logs/app.log
```

---

## 7. Performance Impact

| Component | Overhead | Notes |
|-----------|----------|-------|
| Metrics middleware | ~0.1ms | Timing only, in-memory operations |
| DB query timing | ~0.05ms | Date.now() calls only |
| Structured logging | ~0.5ms | Pino is highly optimized |
| **Total** | **~0.65ms** | Negligible impact on request latency |

---

## 8. Future Enhancements

1. **External Metrics**: Integrate Prometheus client for external scraping
2. **Distributed Tracing**: Add OpenTelemetry for cross-service traces
3. **Log Aggregation**: Connect to ELK/Loki for centralized logging
4. **Metrics Persistence**: Store metrics snapshots for historical analysis
5. **Custom Dashboards**: Build Grafana dashboards for observability

---

## 9. Testing

### 9.1 Verify Metrics Endpoint

```bash
# Start server
npm run dev

# In another terminal, generate some traffic
curl http://localhost:3001/health
curl http://localhost:3001/api/sectors
# ... more requests

# Fetch metrics
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/metrics
```

### 9.2 Run Tests

```bash
# Run all tests (ensure no regressions)
npm test

# Run specific observability tests (when implemented)
npm test -- --testNamePattern="observability"
```

---

**Document Version:** 1.0  
**Last Updated:** 2025-02-18  
**Phase:** 5.4 Observability Maturity
