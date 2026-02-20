# Performance Profiling Checklist

**Project:** DPT-Local Teknokent Management System  
**Purpose:** Guide for profiling and optimizing application performance

---

## Node.js Profiling

### CPU Profiling

#### Using Clinic.js (Recommended)

```bash
# Install clinic
npm install -g clinic

# Start server with clinic doctor
clinic doctor -- npm run dev

# In another terminal, run load test
k6 run server/scripts/perf/k6-dashboard.js

# Press Ctrl+C to stop profiling
# Clinic will open a browser with results
```

#### Interpreting Clinic.js Results

| Indicator | Good | Bad |
|-----------|------|-----|
| **CPU Usage** | < 70% | > 90% |
| **Event Loop Delay** | < 50ms | > 200ms |
| **Active Handles** | Stable | Growing |
| **Heap Usage** | Stable | Growing |

#### Using 0x (Alternative)

```bash
# Install 0x
npm install -g 0x

# Profile server
0x -- npm run dev

# Run load test in another terminal
# Press Ctrl+C to stop
# 0x will generate flamegraph
```

### Memory Profiling

#### Using Node.js Inspector

```bash
# Start server with inspector
node --inspect=0.0.0.0:9229 dist/index.js

# Open Chrome DevTools
# Navigate to: chrome://inspect
# Click "inspect" on the target
```

#### Heap Snapshot Steps

1. Open Chrome DevTools > Memory
2. Take initial heap snapshot
3. Run load test
4. Take second heap snapshot
5. Compare snapshots for memory leaks

#### Memory Leak Indicators

- Heap size grows continuously
- Detached DOM nodes accumulate
- Event listeners not cleaned up

---

## PostgreSQL Profiling

### Enable Slow Query Log

```sql
-- Set minimum duration for logging (milliseconds)
ALTER SYSTEM SET log_min_duration_statement = 100;

-- Reload configuration
SELECT pg_reload_conf();

-- Check setting
SHOW log_min_duration_statement;
```

View logs:
```bash
# PostgreSQL logs location varies by OS
# Ubuntu/Debian: /var/log/postgresql/postgresql-15-main.log
# macOS (Homebrew): /usr/local/var/log/postgresql@15.log
# Windows: PostgreSQL\data\log\
```

### EXPLAIN ANALYZE Workflow

#### Step 1: Identify Slow Query

From application logs or slow query log, identify a query taking > 100ms.

#### Step 2: Run EXPLAIN ANALYZE

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) 
SELECT c.id, c.name, c.sector 
FROM companies c 
WHERE c.deleted_at IS NULL 
ORDER BY c.name 
LIMIT 20;
```

#### Step 3: Interpret Results

| Output | Meaning | Target |
|--------|---------|--------|
| **Execution Time** | Total query time | < 50ms |
| **Seq Scan** | Full table scan | Bad (needs index) |
| **Index Scan** | Using index | Good |
| **Bitmap Heap Scan** | Index + fetch | OK |
| **Filter** | Row filtering | Check selectivity |

#### Step 4: Identify Missing Indexes

Look for:
- `Seq Scan` on large tables
- High `actual time` values
- Repeated subqueries

#### Step 5: Add Index (if needed)

See P5.2 Database Optimization for migration scripts.

### Index Usage Analysis

```sql
-- Check index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;

-- Find unused indexes (candidates for removal)
SELECT 
    schemaname,
    tablename,
    indexname
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND indexname NOT LIKE '%_pkey';
```

### Table Size Analysis

```sql
-- Show table sizes with row counts
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Recording Before/After Metrics

### Template

```markdown
### Optimization: [Description]

**Date:** YYYY-MM-DD

**Before:**
- Query: [SQL]
- EXPLAIN: [output]
- Execution Time: [X ms]
- API Response Time: [Y ms]

**After:**
- Query: [SQL with optimization]
- EXPLAIN: [output]
- Execution Time: [X ms]
- API Response Time: [Y ms]

**Improvement:**
- Query Speed: [Z%]
- API Speed: [W%]

**Changes Made:**
- Added index: [index definition]
- Modified query: [what changed]
```

### Example

```markdown
### Optimization: Companies List Query

**Date:** 2025-02-18

**Before:**
```sql
SELECT * FROM companies 
WHERE deleted_at IS NULL 
ORDER BY name 
LIMIT 20 OFFSET 0;
```
- Execution Time: 245 ms
- API Response Time: 380 ms
- Seq Scan on companies (1000 rows)

**After:**
```sql
SELECT id, name, sector, manager_name 
FROM companies 
WHERE deleted_at IS NULL 
ORDER BY name 
LIMIT 20 OFFSET 0;
```
- Execution Time: 12 ms
- API Response Time: 85 ms
- Index Scan using idx_companies_name

**Improvement:**
- Query Speed: 95% faster
- API Speed: 78% faster

**Changes Made:**
- Selected only required columns
- Added index: CREATE INDEX idx_companies_active ON companies(id, name) WHERE deleted_at IS NULL
```

---

## Common Performance Issues

### 1. N+1 Query Problem

**Symptom:** API makes N database calls for each of N items.

**Detection:**
- Look for loops in route handlers
- Check pg_stat_database for high transaction counts

**Solution:** Use JOINs or separate endpoint for details.

### 2. Missing Indexes

**Symptom:** Seq Scan on large tables.

**Detection:** EXPLAIN ANALYZE shows `Seq Scan`.

**Solution:** Add appropriate indexes (see P5.2).

### 3. Inefficient Aggregates

**Symptom:** Dashboard queries slow.

**Detection:** EXPLAIN shows multiple scans.

**Solution:** Use SQL aggregates instead of in-memory processing.

### 4. Connection Pool Exhaustion

**Symptom:** Requests timeout waiting for DB connection.

**Detection:** Check `pg_stat_activity` for many connections.

**Solution:** Increase pool size or reduce concurrent requests.

---

## Profiling Commands Summary

```bash
# Node.js CPU Profile
clinic doctor -- npm run dev

# Node.js Memory Profile
node --inspect=0.0.0.0:9229 dist/index.js

# PostgreSQL Slow Query Log
psql -c "ALTER SYSTEM SET log_min_duration_statement = 100;"
psql -c "SELECT pg_reload_conf();"

# Query Analysis
psql -c "EXPLAIN (ANALYZE, BUFFERS) SELECT ..."

# Index Usage
psql -c "SELECT * FROM pg_stat_user_indexes ORDER BY idx_scan ASC;"

# Table Sizes
psql -c "SELECT * FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
```

---

## References

- [PostgreSQL EXPLAIN Documentation](https://www.postgresql.org/docs/current/sql-explain.html)
- [Node.js Clinic.js](https://clinicjs.org/)
- [k6 Performance Testing](https://k6.io/docs/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)

---

**Last Updated:** 2025-02-18  
**Phase:** 5.1 - Performance Profiling Setup
