# Phase 5.2 Database Optimization Plan

**Status:** Planning Complete - Ready for Implementation  
**Date:** 2025-02-18  
**Prerequisites:** P5.1 Performance Baseline Complete

---

## Executive Summary

This plan implements targeted database indexes based on actual query patterns observed during P5.1 baseline analysis. The optimization focuses on the most critical slow queries identified:

1. **Dashboard aggregation queries** - 3-table JOINs with complex aggregations
2. **Leases/details** - 5-table LEFT JOIN chain
3. **Unit assignment queries** - PhysicalStructure page lookups
4. **Company search/filter** - LeasingManagement page
5. **Lease expiration queries** - Upcoming lease renewals

---

## Current State Analysis

### Existing Indexes (Migration 002)

| Index | Table | Coverage |
|-------|-------|----------|
| `idx_units_block_id` | units | Foreign key |
| `idx_units_company_id` | units | Foreign key |
| `idx_units_status` | units | Filter |
| `idx_blocks_campus_id` | blocks | Foreign key |
| `idx_leases_company_id` | leases | Foreign key |
| `idx_leases_unit_id` | leases | Foreign key |
| `idx_units_block_status` | units | Composite (block + status) |
| `idx_units_cover` | units | Covering (block, floor, number, status, area) |
| `idx_leases_cover` | leases | Covering (company, rent, dates) |
| Soft delete indexes | all tables | `deleted_at` tracking |

### Query Pattern Analysis

#### Dashboard Query ([`dashboard.ts:18-63`](DPT-Local-main/server/src/routes/dashboard.ts:18-63))
```sql
-- Query 1: Totals with blocks → units LEFT JOIN
SELECT COALESCE(SUM(DISTINCT b.max_area_sqm), 0) as total_area,
       COALESCE(SUM(u.area_sqm), 0) as used_area,
       COUNT(DISTINCT u.company_id) as total_companies
FROM blocks b
LEFT JOIN units u ON u.block_id = b.id AND u.status = 'OCCUPIED' AND u.deleted_at IS NULL
WHERE b.deleted_at IS NULL

-- Query 2: Campus breakdown with revenue
SELECT c.id, c.name,
       COALESCE(SUM(DISTINCT b.max_area_sqm), 0) as total_area,
       COALESCE(SUM(l.monthly_rent + COALESCE(l.operating_fee, 0)), 0) as revenue
FROM campuses c
LEFT JOIN blocks b ON b.campus_id = c.id AND b.deleted_at IS NULL
LEFT JOIN units u ON u.block_id = b.id AND u.status = 'OCCUPIED' AND u.deleted_at IS NULL
LEFT JOIN leases l ON l.company_id = u.company_id AND l.deleted_at IS NULL
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name
```

**Bottleneck:** `SUM(DISTINCT b.max_area_sqm)` and 4-table JOIN for revenue

#### Leases Details Query ([`leases.ts:64-77`](DPT-Local-main/server/src/routes/leases.ts:64-77))
```sql
SELECT c.id as company_id, c.*,
       l.id as lease_id, l.start_date, l.end_date, l.monthly_rent, l.operating_fee,
       u.id as unit_id, u.number, u.floor, u.area_sqm, u.status,
       b.id as block_id, b.name as block_name, b.campus_id,
       cp.id as campus_id, cp.name as campus_name
FROM companies c
LEFT JOIN leases l ON l.company_id = c.id AND l.deleted_at IS NULL
LEFT JOIN units u ON u.company_id = c.id AND u.deleted_at IS NULL
LEFT JOIN blocks b ON u.block_id = b.id AND b.deleted_at IS NULL
LEFT JOIN campuses cp ON b.campus_id = cp.id AND cp.deleted_at IS NULL
WHERE c.deleted_at IS NULL
```

**Bottleneck:** 5-table LEFT JOIN chain, no indexes on intermediate join keys

---

## Proposed New Indexes (Migration 004)

### 1. Dashboard Revenue Index
```sql
CREATE INDEX idx_dashboard_revenue
ON leases(company_id, monthly_rent, operating_fee)
WHERE deleted_at IS NULL;
```
**Purpose:** Speed up revenue aggregation in dashboard  
**Query:** `SUM(l.monthly_rent + l.operating_fee)`  
**Impact:** Covers lease columns needed for revenue calculation

### 2. Dashboard Occupancy Index
```sql
CREATE INDEX idx_dashboard_occupancy
ON units(block_id, company_id, status, area_sqm)
WHERE deleted_at IS NULL AND status = 'OCCUPIED';
```
**Purpose:** Optimize occupied unit counting  
**Query:** `COUNT(DISTINCT u.company_id)` and `SUM(u.area_sqm)`

### 3. Campus Breakdown Index
```sql
CREATE INDEX idx_campus_breakdown
ON blocks(campus_id, id)
WHERE deleted_at IS NULL;
```
**Purpose:** Cover campuses → blocks join  
**Query:** Campus breakdown aggregation

### 4. Leases Details Companies Cover
```sql
CREATE INDEX idx_leases_details_companies
ON companies(id, name, sector, deleted_at)
WHERE deleted_at IS NULL;
```
**Purpose:** Cover company columns in 5-table join  
**Impact:** Index-only scan for company data

### 5. Leases Details Units Cover
```sql
CREATE INDEX idx_leases_details_units
ON units(company_id, block_id, number, floor, status, area_sqm, deleted_at)
WHERE deleted_at IS NULL;
```
**Purpose:** Cover unit data in lease details join  
**Impact:** Combines `idx_units_company_block` with additional columns

### 6. Unit Assignment Search
```sql
CREATE INDEX idx_units_block_floor_number
ON units(block_id, floor, number, status)
WHERE deleted_at IS NULL;
```
**Purpose:** Optimize PhysicalStructure page unit lookup  
**Query:** Filter by block + floor + number

### 7. Vacant Units Partial Index
```sql
CREATE INDEX idx_units_vacant
ON units(block_id, floor, number, area_sqm)
WHERE deleted_at IS NULL AND status = 'VACANT';
```
**Purpose:** Fast lookup for assignable units (most common query)  
**Impact:** Smaller index than full table scan

### 8. Occupied Units Partial Index
```sql
CREATE INDEX idx_units_occupied
ON units(company_id, block_id, id)
WHERE deleted_at IS NULL AND status = 'OCCUPIED';
```
**Purpose:** Leasing management queries  
**Query:** Find all occupied units by company

### 9. Company Search Covering Index
```sql
CREATE INDEX idx_companies_search
ON companies(name, manager_name, sector, id)
WHERE deleted_at IS NULL;
```
**Purpose:** Optimize company search/filter  
**Query:** Search by name, manager, or sector

### 10. Expiring Leases Index
```sql
CREATE INDEX idx_leases_expiring
ON leases(end_date DESC, company_id, id)
WHERE deleted_at IS NULL AND end_date >= CURRENT_DATE;
```
**Purpose:** Find leases expiring soon  
**Query:** Filter by end_date >= CURRENT_DATE  
**Impact:** Partial index reduces size significantly

### 11. Audit Log User Filter
```sql
CREATE INDEX idx_audit_logs_user_timestamp
ON audit_logs(user_name, timestamp DESC, entity_type, action);
```
**Purpose:** Audit log pagination with user filter  
**Query:** Admin audit trail searches

---

## Expected Performance Improvements

| Query | Before | After | Improvement |
|-------|--------|-------|-------------|
| Dashboard (full) | ~150-200ms | ~50-80ms | 60% faster |
| Leases/details | ~200-300ms | ~80-120ms | 60% faster |
| Unit lookup | ~20-40ms | ~5-10ms | 75% faster |
| Company search | ~50-100ms | ~15-30ms | 70% faster |
| Expiring leases | ~100-150ms | ~20-40ms | 80% faster |

---

## Migration Strategy

### Step 1: Create Migration File
**File:** `server/src/db/migrations/004_add_phase5_indexes.sql`

### Step 2: Run Migration
```bash
npm run db:migrate
```

### Step 3: Verify Indexes Created
```sql
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE 'idx_%' 
ORDER BY indexname;
```

### Step 4: Measure Performance
Run P5.1 baseline tests again:
```bash
npm run perf:run
```

---

## Rollback Plan

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

## Implementation Checklist

- [ ] Create `004_add_phase5_indexes.sql`
- [ ] Update `MIGRATION_LOG.md`
- [ ] Create `docs/database-optimization.md`
- [ ] Run migration on local database
- [ ] Run P5.1 performance tests (before/after)
- [ ] Document results in `database-optimization.md`
- [ ] Verify no write performance regression
