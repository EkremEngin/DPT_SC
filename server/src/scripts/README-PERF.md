# Performance Testing - Phase 5.1

**Simplified performance baseline using Autocannon (Node-native)**

---

## Quick Start

```bash
# 1. Start the server
cd server && npm run dev

# 2. Generate performance test dataset (in new terminal)
PERF_SEED=true npm run db:seed:perf

# 3. Run performance tests
npm run perf:run
```

---

## Performance Thresholds

| Metric | Target |
|--------|--------|
| p95 Latency | < 300ms |
| p99 Latency | < 450ms* |
| Error Rate | < 1% |

*Complex endpoints (dashboard, leases/details) allow 1.5x threshold

---

## Test Endpoints

| Endpoint | Connections | Duration | Notes |
|----------|-------------|----------|-------|
| GET /api/companies | 10 | 10s | Paginated list |
| GET /api/leases | 10 | 10s | Paginated list |
| GET /api/leases/details | 5 | 10s | Complex join query |
| GET /api/dashboard | 5 | 10s | Aggregations |

---

## Expected Output

```
╔════════════════════════════════════════════════════════════╗
║        DPT-Local Performance Baseline Test                 ║
╚════════════════════════════════════════════════════════════╝

Target: http://localhost:3001
Thresholds: p95 < 300ms, errors < 1%

✅ Auth token acquired

Testing GET /api/companies...
Testing GET /api/leases...
Testing GET /api/leases/details...
Testing GET /api/dashboard...

╔════════════════════════════════════════════════════════════╗
║                      Summary                                 ║
╚════════════════════════════════════════════════════════════╝

✅ PASS GET /api/companies
   Avg: 85.23ms
   p95: 180.45ms
   p99: 320.12ms
   RPS: 45.67
   Errors: 0 (0.00%)

✅ PASS GET /api/leases
   Avg: 92.11ms
   p95: 195.33ms
   p99: 350.22ms
   RPS: 42.15
   Errors: 0 (0.00%)

...

✅ Overall: 4/4 tests passed
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| API_URL | http://localhost:3001 | API base URL |
| TEST_USER | admin | Login username |
| TEST_PASSWORD | admin123 | Login password |

---

## Dataset Generator

The performance test dataset generates:

- 500 companies (configurable via PERF_COMPANIES)
- 2,500+ units (configurable via PERF_UNITS)
- 5 campuses
- 15-25 blocks
- 70% occupancy rate

**Usage:**
```bash
# Default (500 companies)
PERF_SEED=true npm run db:seed:perf

# Custom size (1000 companies)
PERF_SEED=true PERF_COMPANIES=1000 npm run db:seed:perf
```

**Safety:** Requires PERF_SEED=true to prevent accidental data generation.

---

## Files

| File | Purpose |
|------|---------|
| [`src/db/seed-perf.ts`](../src/db/seed-perf.ts) | Dataset generator |
| [`src/scripts/perf-runner.ts`](../src/scripts/perf-runner.ts) | Autocannon test runner |

---

## Troubleshooting

### Server not running
```bash
cd server && npm run dev
```

### Permission denied (PERF_SEED)
```bash
PERF_SEED=true npm run db:seed:perf
```

### Autocannon not found
```bash
npm install autocannon @types/autocannon
```

---

**Last Updated:** 2025-02-18  
**Phase:** 5.1 - Performance Baseline (Refactored)
