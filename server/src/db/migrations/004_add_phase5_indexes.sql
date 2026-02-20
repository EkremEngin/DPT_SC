-- Migration 004: Phase 5.2 Database Optimization Indexes
-- 
-- This migration adds targeted indexes based on actual query patterns observed
-- during Phase 5.1 Performance Baseline testing.
--
-- Date: 2025-02-18
-- Prerequisites: Migration 002 (performance indexes) and Migration 003 (audit trigger)
--
-- Expected Performance Improvements:
-- - Dashboard: ~60% faster (150-200ms → 50-80ms)
-- - Leases/details: ~60% faster (200-300ms → 80-120ms)
-- - Unit lookup: ~75% faster (20-40ms → 5-10ms)
-- - Company search: ~70% faster (50-100ms → 15-30ms)
-- - Expiring leases: ~80% faster (100-150ms → 20-40ms)

-- ============================================================================
-- 1. Dashboard Revenue Index
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dashboard_revenue
ON leases(company_id, monthly_rent, operating_fee)
WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. Dashboard Occupancy Index (Partial)
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dashboard_occupancy
ON units(block_id, company_id, status, area_sqm)
WHERE deleted_at IS NULL AND status = 'OCCUPIED';

-- ============================================================================
-- 3. Campus Breakdown Index
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campus_breakdown
ON blocks(campus_id, id)
WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. Leases Details Companies Covering Index
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leases_details_companies
ON companies(id, name, sector, deleted_at)
WHERE deleted_at IS NULL;

-- ============================================================================
-- 5. Leases Details Units Covering Index
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leases_details_units
ON units(company_id, block_id, number, floor, status, area_sqm, deleted_at)
WHERE deleted_at IS NULL;

-- ============================================================================
-- 6. Unit Assignment Search Index
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_units_block_floor_number
ON units(block_id, floor, number, status)
WHERE deleted_at IS NULL;

-- ============================================================================
-- 7. Vacant Units Partial Index
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_units_vacant
ON units(block_id, floor, number, area_sqm)
WHERE deleted_at IS NULL AND status = 'VACANT';

-- ============================================================================
-- 8. Occupied Units Partial Index
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_units_occupied
ON units(company_id, block_id, id)
WHERE deleted_at IS NULL AND status = 'OCCUPIED';

-- ============================================================================
-- 9. Company Search Covering Index
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_search
ON companies(name, manager_name, sector, id)
WHERE deleted_at IS NULL;

-- ============================================================================
-- 10. Expiring Leases Index
-- ============================================================================
-- Note: CURRENT_DATE is STABLE, not IMMUTABLE, so we use a regular index
-- The application will filter by end_date >= CURRENT_DATE in queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leases_expiring
ON leases(end_date DESC, company_id, id)
WHERE deleted_at IS NULL;

-- ============================================================================
-- 11. Audit Log User Filter Index
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_timestamp
ON audit_logs(user_name, timestamp DESC, entity_type, action);
