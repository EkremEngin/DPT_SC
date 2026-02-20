# Performance Baseline - Phase 5

**Project:** DPT-Local Teknokent Management System  
**Date:** 2025-02-18  
**Status:** P5.1 - Performance Baseline Establishment

---

## Purpose

This document establishes the initial performance baseline for DPT-Local before any optimizations are applied. All future performance improvements will be measured against these baseline numbers.

---

## Performance Targets

### Service Level Objectives (SLOs)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **p95 Latency** | < 200ms | Response time at 95th percentile |
| **p99 Latency** | < 500ms | Response time at 99th percentile |
| **Error Rate** | < 1% | Failed requests / Total requests |
| **Sustained RPS** | 50+ | Requests per second under load |

### Per-Endpoint Targets

| Endpoint | Target RPS | p95 Target | p99 Target |
|----------|-----------|------------|------------|
| `POST /api/auth/login` | 20 | < 200ms | < 500ms |
| `GET /api/companies` | 50 | < 200ms | < 500ms |
| `GET /api/leases` | 40 | < 200ms | < 500ms |
| `GET /api/leases/details` | 30 | < 300ms | < 600ms |
| `GET /api/dashboard` | 30 | < 300ms | < 600ms |

---

## Dataset Assumptions

Performance tests are conducted with the following dataset sizes:

| Entity | Count | Notes |
|--------|-------|-------|
| **Campuses** | 5 | Multiple locations |
| **Blocks** | 15-25 | 3-5 per campus |
| **Units** | 2,500+ | Office spaces |
| **Companies** | 500-1,000 | Tenant companies |
| **Leases** | 350-700 | 70% occupancy rate |
| **Score Entries** | 100-500 | Performance metrics |
| **Documents** | 100-500 | Contract documents |

---

## Baseline Measurements

### Hardware Assumptions

Baseline tests are run on the following specifications:

- **CPU:** 4 cores @ 2.4GHz or equivalent
- **RAM:** 8GB minimum
- **Database:** PostgreSQL 15 on same machine (not optimized)
- **Node.js:** v20 LTS

### Initial Baseline (To Be Recorded)

Run the performance tests and record results here:

#### Authentication Endpoint

```
Date: ___________
Test: k6 run server/scripts/perf/k6-auth.js

Results:
- Total Requests: _____
- p95 Latency: _____ ms
- p99 Latency: _____ ms
- Error Rate: _____ %
- Max RPS: _____
```

#### Companies List Endpoint

```
Date: ___________
Test: k6 run server/scripts/perf/k6-companies.js

Results:
- Total Requests: _____
- p95 Latency: _____ ms
- p99 Latency: _____ ms
- Error Rate: _____ %
- Max RPS: _____
```

#### Leases Endpoints

```
Date: ___________
Test: k6 run server/scripts/perf/k6-leases.js

Results:
- Total Requests: _____
- p95 Latency: _____ ms
- p99 Latency: _____ ms
- Error Rate: _____ %
- Max RPS: _____
```

#### Dashboard Endpoint

```
Date: ___________
Test: k6 run server/scripts/perf/k6-dashboard.js

Results:
- Total Requests: _____
- p95 Latency: _____ ms
- p99 Latency: _____ ms
- Error Rate: _____ %
- Max RPS: _____
```

---

## Running Baseline Tests

### 1. Start the Server

```bash
cd server
npm run dev
```

Server should start on port 3001.

### 2. Generate Test Dataset

```bash
# Create performance test data
PERF_SEED=true PERF_COMPANIES=500 npm run db:seed:perf
```

### 3. Run Performance Tests

```bash
# Authentication test
k6 run server/scripts/perf/k6-auth.js

# Companies test
k6 run server/scripts/perf/k6-companies.js

# Leases test
k6 run server/scripts/perf/k6-leases.js

# Dashboard test
k6 run server/scripts/perf/k6-dashboard.js
```

### 4. Record Results

Copy the output from each test and paste into the "Baseline Measurements" section above.

---

## Interpretation Guide

### Pass Criteria

A test **passes** if:
- ✓ p95 latency is below target
- ✓ p99 latency is below target  
- ✓ Error rate is < 1%
- ✓ All response validations pass

### Fail Criteria

A test **fails** if:
- ✗ p95 latency exceeds target
- ✗ Error rate exceeds 1%
- ✗ Response structure is invalid

### What to Do If Tests Fail

1. **Check Database Performance**
   - Run EXPLAIN ANALYZE on slow queries
   - Verify indexes exist (see P5.2)

2. **Check Node.js Performance**
   - Use clinic.js or 0x for CPU profiling
   - Check memory usage with `--inspect`

3. **Check Network**
   - Verify no rate limiting interference
   - Check connection pool settings

---

## Next Steps

After baseline is established:

1. **P5.2 - Database Optimization**
   - Add missing indexes
   - Re-run tests to measure improvement

2. **Document Improvements**
   - Record before/after metrics
   - Calculate percentage improvements

3. **Continuous Monitoring**
   - Run baseline tests weekly
   - Track performance trends

---

## Notes

- Tests are designed to be reproducible
- Use seeded random data for consistency
- All API contracts remain unchanged
- Tests can be run in CI/CD pipeline

---

**Last Updated:** 2025-02-18  
**Phase:** 5.1 - Performance Baseline
