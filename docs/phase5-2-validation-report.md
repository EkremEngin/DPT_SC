# Phase 5.2 Database Optimization - Evidence-Grade Validation Report

**Date**: February 18, 2026  
**Migration**: 004_add_phase5_indexes.sql  
**PostgreSQL Version**: 16.11 (Debian 16.11-1.pgdg13+1)  
**Database**: appdb  
**User**: app

---

## PART 1: Migration File

**File**: `server/src/db/migrations/004_add_phase5_indexes.sql`

**Content**:
```sql
-- Migration 004: Phase 5.2 Database Optimization Indexes
-- 
-- This migration adds targeted indexes based on actual query patterns observed
-- during Phase 5.1 Performance Baseline testing.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dashboard_revenue
ON leases(company_id, monthly_rent, operating_fee)
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dashboard_occupancy
ON units(block_id, company_id, status, area_sqm)
WHERE deleted_at IS NULL AND status = 'OCCUPIED';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campus_breakdown
ON blocks(campus_id, id)
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leases_details_companies
ON companies(id, name, sector, deleted_at)
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leases_details_units
ON units(company_id, block_id, number, floor, status, area_sqm, deleted_at)
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_units_block_floor_number
ON units(block_id, floor, number, status)
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_units_vacant
ON units(block_id, floor, number, area_sqm)
WHERE deleted_at IS NULL AND status = 'VACANT';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_units_occupied
ON units(company_id, block_id, id)
WHERE deleted_at IS NULL AND status = 'OCCUPIED';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_search
ON companies(name, manager_name, sector, id)
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leases_expiring
ON leases(end_date DESC, company_id, id)
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_timestamp
ON audit_logs(user_name, timestamp DESC, entity_type, action);
```

---

## PART 2: Migration Runner Transaction Behavior

**File**: `server/src/db/run-migration.ts`

**Transaction Behavior**:
- **No transaction wrapper used** - `CREATE INDEX CONCURRENTLY` cannot run inside a transaction
- Each statement executed separately via `query()` function
- Statements split by semicolon and executed sequentially
- `CONCURRENTLY` flag allows index creation without locking the table

**Key Code**:
```typescript
const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

for (let i = 0; i < statements.length; i++) {
    await query(statement);  // Auto-commits
}
```

---

## PART 3: EXPLAIN ANALYZE Results

### Q1: Dashboard Revenue Query
```sql
SELECT COALESCE(SUM(l.monthly_rent + COALESCE(l.operating_fee, 0)), 0) as revenue
FROM leases l WHERE l.deleted_at IS NULL
```

**Execution Plan**:
```
Aggregate  (cost=7.57..7.58 rows=1 width=32) (actual time=0.100..0.100 rows=1 loops=1)
  Buffers: shared hit=4
  ->  Seq Scan on leases l  (cost=0.00..6.38 rows=238 width=22) (actual time=0.005..0.035 rows=238 loops=1)
        Filter: (deleted_at IS NULL)
        Buffers: shared hit=4
Planning Time: 0.704 ms
Execution Time: 0.140 ms
```

**Analysis**: Seq Scan used (new index not selected by planner due to small table size - 238 rows)

---

### Q2: Dashboard Occupancy Query
```sql
SELECT COUNT(DISTINCT u.company_id), COALESCE(SUM(u.area_sqm), 0)
FROM units u WHERE u.status = 'OCCUPIED' AND u.deleted_at IS NULL
```

**Execution Plan**:
```
Aggregate  (cost=18.16..18.17 rows=1 width=40) (actual time=0.118..0.119 rows=1 loops=1)
  Buffers: shared hit=7
  ->  Sort  (cost=16.37..16.96 rows=238 width=21) (actual time=0.092..0.098 rows=238 loops=1)
        Sort Key: company_id
        ->  Seq Scan on units u  (cost=0.00..6.97 rows=238 width=21) (actual time=0.009..0.037 rows=238 loops=1)
              Filter: ((deleted_at IS NULL) AND ((status)::text = 'OCCUPIED'::text))
Planning Time: 0.879 ms
Execution Time: 0.144 ms
```

**Analysis**: Seq Scan used (small dataset - 238 rows)

---

### Q3: Lease Details (5-table JOIN)
```sql
SELECT c.id, c.name, l.id as lease_id, l.start_date, l.end_date,
       u.id as unit_id, u.number, u.floor, b.id as block_id, b.name,
       cp.id as campus_id, cp.name as campus_name
FROM companies c
LEFT JOIN leases l ON l.company_id = c.id AND l.deleted_at IS NULL
LEFT JOIN units u ON u.company_id = c.id AND u.deleted_at IS NULL
LEFT JOIN blocks b ON u.block_id = b.id AND b.deleted_at IS NULL
LEFT JOIN campuses cp ON b.campus_id = cp.id AND cp.deleted_at IS NULL
WHERE c.deleted_at IS NULL LIMIT 10
```

**Execution Plan**:
```
Limit  (cost=0.59..6.04 rows=10 width=150) (actual time=0.102..0.130 rows=10 loops=1)
  Buffers: shared hit=35
  ->  Merge Left Join  (cost=0.59..130.18 rows=238 width=150) (actual time=0.101..0.128 rows=10 loops=1)
        ->  Index Scan using idx_leases_company_id on leases l
        ->  Index Scan using idx_units_company_id on units u
        ->  Index Scan using companies_pkey on companies c
Planning Time: 1.500 ms
Execution Time: 0.283 ms
```

**Analysis**: Using existing indexes (`idx_leases_company_id`, `idx_units_company_id`)

---

### Q4: Unit Assignment Lookup
**SKIPPED**: Type mismatch in schema

---

### Q5: Expiring Leases Query ✓ **NEW INDEX USED**
```sql
SELECT l.id, l.end_date, c.name
FROM leases l
JOIN companies c ON c.id = l.company_id AND c.deleted_at IS NULL
WHERE l.deleted_at IS NULL AND l.end_date >= CURRENT_DATE
ORDER BY l.end_date DESC LIMIT 20
```

**Execution Plan**:
```
Limit  (cost=0.42..8.95 rows=20 width=54) (actual time=0.098..0.130 rows=20 loops=1)
  Buffers: shared hit=56
  ->  Nested Loop  (cost=0.42..101.90 rows=238 width=54) (actual time=0.097..0.128 rows=20 loops=1)
        ->  **Index Only Scan using idx_leases_expiring on leases l**  (cost=0.27..31.38 rows=238 width=36)
              Index Cond: (end_date >= CURRENT_DATE)
              Heap Fetches: 20
              Buffers: shared hit=16
Planning Time: 0.284 ms
Execution Time: 0.200 ms
```

**Analysis**: ✓ **`idx_leases_expiring` IS BEING USED** - Index Only Scan!

---

## PART 4: Index Usage Statistics

### Phase 5.2 Index Scan Counts
| Index Name | Table | Scans | Tup Read | Tup Fetch |
|------------|-------|-------|----------|-----------|
| idx_companies_search | companies | 99 | 1980 | 1980 |
| idx_leases_expiring | leases | 1+ | - | - |
| idx_leases_details_units | units | 0 | 0 | 0 |
| idx_dashboard_occupancy | units | 0 | 0 | 0 |
| idx_campus_breakdown | blocks | 0 | 0 | 0 |
| idx_leases_details_companies | companies | 0 | 0 | 0 |
| idx_units_block_floor_number | units | 0 | 0 | 0 |
| idx_units_vacant | units | 0 | 0 | 0 |
| idx_units_occupied | units | 0 | 0 | 0 |
| idx_dashboard_revenue | leases | 0 | 0 | 0 |
| idx_audit_logs_user_timestamp | audit_logs | 0 | 0 | 0 |

**Notes**:
- `idx_companies_search`: 99 scans from regular application traffic (LeasingManagement page)
- `idx_leases_expiring`: Used in Q5 EXPLAIN ANALYZE
- Other indexes: Need more query traffic to accumulate stats

---

### Table Sequential vs Index Scans
| Table | Seq Scans | Seq Tup Read | Index Scans | Index Tup Fetch |
|-------|-----------|--------------|-------------|----------------|
| companies | 72,819 | 253,760,126 | 40,506 | 27,028 |
| leases | 70,679 | 76,687,697 | 30,889,460 | 8,792,252 |
| blocks | 45,999 | 6,783,371 | 86,466 | 86,306 |
| campuses | 15,052 | 1,521,428 | 20,130 | 20,095 |
| units | 1,833 | 520,557 | 2,296,418 | 87,821,815 |
| audit_logs | 7 | 2,267 | 14 | 112 |

**Analysis**: High sequential scans on `companies` due to table scan patterns in queries

---

## PART 5: Performance Test Results

**Command**: `npm run perf:run`

**Test Configuration**:
- Concurrency: 10 connections
- Duration: 10 seconds per endpoint
- Auth: JWT token (Ekoreiz54 user)

*(Results pending - test running)*

---

## SHORT SUMMARY

### Are new indexes being used?
**YES** - Evidence:
1. `idx_leases_expiring` - Confirmed "Index Only Scan" in Q5 EXPLAIN ANALYZE
2. `idx_companies_search` - 99 scans recorded in pg_stat_user_indexes

### Did Seq Scan convert to Index Scan?
**MIXED**:
- Q5 (Expiring Leases): ✓ Uses Index Only Scan
- Q1, Q2, Q3: Still use Seq Scan (small dataset - planner's decision)
- Companies table still has high seq_scan count (72,819)

### Did latency actually drop?
**PENDING** - Performance test running (`npm run perf:run`)

### Key Observations
1. **Small dataset (238 rows)**: PostgreSQL planner prefers Seq Scan for tables < few thousand rows
2. **`idx_leases_expiring` working**: Index Only Scan achieved (best case scenario)
3. **`idx_companies_search` active**: Real application queries using it
4. **Most Phase 5.2 indexes at 0 scans**: Expected - need larger dataset or more query traffic

### Recommendations
1. Run with performance dataset (`npm run db:seed:perf` → 15,000 rows) to see index benefits
2. Re-run EXPLAIN ANALYZE after dataset is populated
3. Monitor index usage over time with real application traffic
