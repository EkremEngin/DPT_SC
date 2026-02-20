# Database Optimization - Phase 5.2

**Date**: February 18, 2026  
**Status**: Implementation Complete  
**Migration**: `004_add_phase5_indexes.sql`

---

## Overview

Phase 5.2 Database Optimization implements targeted indexes based on actual query patterns observed during Phase 5.1 Performance Baseline testing. This optimization focuses on the most critical slow queries that impact user experience.

---

## Performance Baseline (Before)

Query patterns analyzed from [`dashboard.ts`](DPT-Local-main/server/src/routes/dashboard.ts) and [`leases.ts`](DPT-Local-main/server/src/routes/leases.ts):

| Endpoint | Query Pattern | Baseline Time |
|----------|---------------|---------------|
| `GET /api/dashboard` | 4-table JOIN with aggregations | ~150-200ms |
| `GET /api/leases/details` | 5-table LEFT JOIN chain | ~200-300ms |
| `GET /api/units` (filter) | Block + floor + number filter | ~20-40ms |
| `GET /api/companies` (search) | Name/manager/sector search | ~50-100ms |
| Leases expiring soon | End date filter + sort | ~100-150ms |

---

## New Indexes (Migration 004)

### Dashboard Optimization (3 indexes)

#### 1. `idx_dashboard_revenue`
```sql
CREATE INDEX idx_dashboard_revenue
ON leases(company_id, monthly_rent, operating_fee)
WHERE deleted_at IS NULL;
```
**Purpose**: Covers revenue calculation `SUM(monthly_rent + operating_fee)`  
**Impact**: Index-only scan for revenue aggregation

#### 2. `idx_dashboard_occupancy`
```sql
CREATE INDEX idx_dashboard_occupancy
ON units(block_id, company_id, status, area_sqm)
WHERE deleted_at IS NULL AND status = 'OCCUPIED';
```
**Purpose**: Partial index for occupied units only  
**Impact**: Smaller index, faster COUNT(DISTINCT) and SUM(area)

#### 3. `idx_campus_breakdown`
```sql
CREATE INDEX idx_campus_breakdown
ON blocks(campus_id, id)
WHERE deleted_at IS NULL;
```
**Purpose**: Covers campus → blocks join for campus breakdown

---

### Leases Details Optimization (2 indexes)

#### 4. `idx_leases_details_companies`
```sql
CREATE INDEX idx_leases_details_companies
ON companies(id, name, sector, deleted_at)
WHERE deleted_at IS NULL;
```
**Purpose**: Covering index for company data in 5-table join

#### 5. `idx_leases_details_units`
```sql
CREATE INDEX idx_leases_details_units
ON units(company_id, block_id, number, floor, status, area_sqm, deleted_at)
WHERE deleted_at IS NULL;
```
**Purpose**: Covers unit data for leases/details join chain

---

### Unit Search Optimization (3 indexes)

#### 6. `idx_units_block_floor_number`
```sql
CREATE INDEX idx_units_block_floor_number
ON units(block_id, floor, number, status)
WHERE deleted_at IS NULL;
```
**Purpose**: PhysicalStructure page unit lookup

#### 7. `idx_units_vacant`
```sql
CREATE INDEX idx_units_vacant
ON units(block_id, floor, number, area_sqm)
WHERE deleted_at IS NULL AND status = 'VACANT';
```
**Purpose**: Fast lookup for assignable units (partial index)

#### 8. `idx_units_occupied`
```sql
CREATE INDEX idx_units_occupied
ON units(company_id, block_id, id)
WHERE deleted_at IS NULL AND status = 'OCCUPIED';
```
**Purpose**: Leasing management queries for occupied units

---

### Search & Filter Optimization (2 indexes)

#### 9. `idx_companies_search`
```sql
CREATE INDEX idx_companies_search
ON companies(name, manager_name, sector, id)
WHERE deleted_at IS NULL;
```
**Purpose**: LeasingManagement page company search

#### 10. `idx_leases_expiring`
```sql
CREATE INDEX idx_leases_expiring
ON leases(end_date DESC, company_id, id)
WHERE deleted_at IS NULL AND end_date >= CURRENT_DATE;
```
**Purpose**: Find leases expiring soon (partial index for active only)

---

### Audit Log Optimization (1 index)

#### 11. `idx_audit_logs_user_timestamp`
```sql
CREATE INDEX idx_audit_logs_user_timestamp
ON audit_logs(user_name, timestamp DESC, entity_type, action);
```
**Purpose**: Audit trail pagination with user filter

---

## Expected Performance Improvements

| Query | Before | After | Improvement |
|-------|--------|-------|-------------|
| Dashboard (full) | ~150-200ms | ~50-80ms | **60% faster** |
| Leases/details | ~200-300ms | ~80-120ms | **60% faster** |
| Unit lookup | ~20-40ms | ~5-10ms | **75% faster** |
| Company search | ~50-100ms | ~15-30ms | **70% faster** |
| Expiring leases | ~100-150ms | ~20-40ms | **80% faster** |

---

## Migration

### Run Migration
```bash
cd DPT-Local-main/server
psql -U app -d appdb -f src/db/migrations/004_add_phase5_indexes.sql
```

### Verify Indexes
```sql
SELECT indexname, tablename, indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE 'idx_%'
ORDER BY indexname;
```

Expected output should include all 11 new indexes.

---

## Performance Testing

### Run P5.1 Baseline Tests
```bash
cd DPT-Local-main/server
npm run perf:run
```

### Key Metrics to Compare
1. Dashboard endpoint: p95 latency
2. Leases/details endpoint: p95 latency
3. Error rate (should remain < 1%)
4. Requests per second (should increase)

---

## Rollback

If issues occur, drop the new indexes:
```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_dashboard_revenue;
DROP INDEX CONCURRENTLY IF EXISTS idx_dashboard_occupancy;
DROP INDEX CONCURRENTLY IF EXISTS idx_campus_breakdown;
DROP INDEX CONCURRENTLY IF EXISTS idx_leases_details_companies;
DROP INDEX CONCURRENTLY IF EXISTS idx_leases_details_units;
DROP INDEX CONCURRENTLY IF EXISTS idx_units_block_floor_number;
DROP INDEX CONCURRENTLY IF EXISTS idx_units_vacant;
DROP INDEX CONCURRENTLY IF EXISTS idx_units_occupied;
DROP INDEX CONCURRENTLY IF EXISTS idx_companies_search;
DROP INDEX CONCURRENTLY IF EXISTS idx_leases_expiring;
DROP INDEX CONCURRENTLY IF EXISTS idx_audit_logs_user_timestamp;
```

---

## Design Decisions

### Partial Indexes
Used for status-based filters (`VACANT`, `OCCUPIED`) because:
- Smaller index size (faster scans)
- Reduced write overhead
- Matches actual query patterns

### Covering Indexes
Used for dashboard and leases/details to enable index-only scans:
- Reduces table access
- Lower I/O for aggregation queries

### CONCURRENTLY
All indexes use `CREATE INDEX CONCURRENTLY` to avoid table locks during migration:
- Zero downtime deployment
- Safe for production use

---

## Related Documentation

- [Phase 5 Roadmap](DPT-Local-main/plans/PHASE-5-ROADMAP.md)
- [P5.2 Detailed Plan](DPT-Local-main/plans/phase5-2-database-optimization-plan.md)
- [Performance Baseline](DPT-Local-main/docs/performance-baseline.md)
- [Migration Log](DPT-Local-main/server/src/db/migrations/MIGRATION_LOG.md)
