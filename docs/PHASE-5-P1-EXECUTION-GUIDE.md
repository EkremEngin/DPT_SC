# Phase 5.1 Execution Guide

**Status:** Ready to Execute  
**Last Updated:** 2025-02-18

---

## Overview

This guide provides step-by-step instructions to execute Phase 5.1 - Performance Baseline establishment.

---

## Files Created

### Load Test Scripts
- [`server/scripts/perf/k6-auth.js`](../server/scripts/perf/k6-auth.js) - Authentication endpoint load test
- [`server/scripts/perf/k6-companies.js`](../server/scripts/perf/k6-companies.js) - Companies list load test
- [`server/scripts/perf/k6-leases.js`](../server/scripts/perf/k6-leases.js) - Leases endpoints load test
- [`server/scripts/perf/k6-dashboard.js`](../server/scripts/perf/k6-dashboard.js) - Dashboard load test
- [`server/scripts/perf/README.md`](../server/scripts/perf/README.md) - Performance test documentation

### Dataset Generator
- [`server/scripts/generate-test-dataset.ts`](../server/scripts/generate-test-dataset.ts) - Deterministic test data generator

### Documentation
- [`docs/performance-baseline.md`](performance-baseline.md) - Baseline documentation with recording template
- [`docs/performance-profiling-checklist.md`](performance-profiling-checklist.md) - Profiling SOP

### Roadmap
- [`plans/PHASE-5-ROADMAP.md`](../plans/PHASE-5-ROADMAP.md) - Full Phase 5 roadmap

---

## Prerequisites

### 1. Install k6 (if not installed)

```bash
# macOS
brew install k6

# Linux
sudo apt-get install k6

# Windows
choco install k6
```

### 2. Verify Environment

```bash
# Check Node.js version (should be v20+)
node --version

# Check PostgreSQL is running
pg_isready

# Verify .env file exists
ls server/.env
```

---

## Step-by-Step Execution

### Step 1: Start the Server

```bash
cd server
npm run dev
```

Server should start on port 3001. **Keep this terminal open.**

### Step 2: Generate Performance Test Dataset

```bash
# In a new terminal
cd server

# Generate 500 companies, 2500+ units
PERF_SEED=true npm run db:seed:perf
```

**Expected Output:**
```
🌱 Generating performance test dataset...
   Companies: 500
   Units: 2500
   Campuses: 5

📍 Creating campuses...
   ✓ Teknokent Kampüs A
   ✓ Teknokent Kampüs B
   ...

🏢 Creating blocks...
🚪 Creating units...
   ✓ Created 2500 units

🏢 Creating companies...
   ✓ 100/500 companies created
   ✓ 200/500 companies created
   ...
   ✓ Created 500 companies

📄 Creating leases and assigning units...
   ✓ Created 350 leases

✅ Performance test dataset generated successfully
```

### Step 3: Run Performance Tests

#### Test 1: Authentication

```bash
k6 run server/scripts/perf/k6-auth.js
```

**Expected Output:**
```
Authentication Load Test Summary
================================
Total Requests: XXX
Failed Requests: 0
Success Rate: 100.00%

Response Times:
  - Average: XX.XXms
  - Median: XX.XXms
  - p95: XXX.XXms
  - p99: XXX.XXms
  - Max: XXX.XXms
```

#### Test 2: Companies List

```bash
k6 run server/scripts/perf/k6-companies.js
```

#### Test 3: Leases Endpoints

```bash
k6 run server/scripts/perf/k6-leases.js
```

#### Test 4: Dashboard

```bash
k6 run server/scripts/perf/k6-dashboard.js
```

### Step 4: Record Results

Open [`docs/performance-baseline.md`](performance-baseline.md) and paste each test's output into the "Baseline Measurements" section.

---

## Expected Sample Output Format

### Passing Test Example
```
✓ status is 200
✓ has token
✓ has user object
✓ response time < 200ms

checks.........................: 100.00% ✓ 1000      ✗ 0
http_req_duration..............: avg=85ms    min=12ms    med=72ms    max=450ms    p(95)=180ms    p(99)=320ms
```

### Failing Test Example
```
✗ response time < 200ms

checks.........................: 75.00% ✓ 750       ✗ 250
http_req_duration..............: avg=450ms   min=20ms    med=380ms   max=2000ms   p(95)=890ms    p(99)=1500ms
```

---

## Troubleshooting

### Server Won't Start

```bash
# Check if port 3001 is in use
lsof -i :3001  # macOS/Linux
netstat -ano | findstr :3001  # Windows

# Kill process if needed
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

### k6 Not Found

```bash
# Verify installation
k6 version

# Reinstall if needed
# macOS
brew reinstall k6

# Linux
sudo apt-get install --reinstall k6
```

### Database Connection Errors

```bash
# Verify PostgreSQL is running
pg_isready

# Check connection string in server/.env
cat server/.env | grep DATABASE_URL

# Test connection manually
psql $DATABASE_URL
```

### PERF_SEED Error

```bash
# Must set PERF_SEED environment variable
# Correct:
PERF_SEED=true npm run db:seed:perf

# Incorrect (will fail):
npm run db:seed:perf
```

---

## Quick Reference Commands

```bash
# Start server
cd server && npm run dev

# Generate test dataset
PERF_SEED=true npm run db:seed:perf

# Run all performance tests
k6 run server/scripts/perf/k6-auth.js
k6 run server/scripts/perf/k6-companies.js
k6 run server/scripts/perf/k6-leases.js
k6 run server/scripts/perf/k6-dashboard.js

# Profile with clinic.js
clinic doctor -- npm run dev

# Enable PostgreSQL slow query log
psql -c "ALTER SYSTEM SET log_min_duration_statement = 100;"
psql -c "SELECT pg_reload_conf();"
```

---

## Validation Checklist

P5.1 is complete only if:

- [ ] k6 scripts execute successfully
- [ ] Dataset generation works deterministically
- [ ] Baseline document created with recorded metrics
- [ ] Profiling checklist documented
- [ ] No API contracts changed
- [ ] No failing tests introduced (npm test passes)

---

## Next Steps

After P5.1 is complete:

1. **Review Baseline Results** - Identify slow endpoints (> 200ms p95)
2. **Proceed to P5.2** - Database optimization based on findings
3. **Document Improvements** - Record before/after metrics

---

## Support

For issues or questions:
- Review [`docs/performance-profiling-checklist.md`](performance-profiling-checklist.md)
- Check [`server/scripts/perf/README.md`](../server/scripts/perf/README.md)
- Refer to [`plans/PHASE-5-ROADMAP.md`](../plans/PHASE-5-ROADMAP.md)

---

**Phase 5.1 Implementation Complete**  
**Date:** 2025-02-18
