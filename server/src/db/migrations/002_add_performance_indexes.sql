-- Migration 002: Performance Optimization Indexes
-- This migration adds critical database indexes for query performance optimization

-- =====================================================
-- FOREIGN KEY INDEXES
-- =====================================================

-- Units table indexes
CREATE INDEX IF NOT EXISTS idx_units_block_id ON units(block_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_units_company_id ON units(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status) WHERE deleted_at IS NULL;

-- Blocks table indexes
CREATE INDEX IF NOT EXISTS idx_blocks_campus_id ON blocks(campus_id);

-- Leases table indexes
CREATE INDEX IF NOT EXISTS idx_leases_company_id ON leases(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leases_unit_id ON leases(unit_id) WHERE deleted_at IS NULL;

-- =====================================================
-- COMPOSITE INDEXES (Multi-column)
-- =====================================================

-- Units: Block + Status (for floor occupancy queries)
CREATE INDEX IF NOT EXISTS idx_units_block_status ON units(block_id, status) WHERE deleted_at IS NULL;

-- Units: Company + Block (for company allocation queries)
CREATE INDEX IF NOT EXISTS idx_units_company_block ON units(company_id, block_id) WHERE deleted_at IS NULL AND company_id IS NOT NULL;

-- =====================================================
-- SPECIALIZED INDEXES
-- =====================================================

-- Company score entries (for score history queries)
CREATE INDEX IF NOT EXISTS idx_score_entries_company_id ON company_score_entries(company_id);

-- Company documents (for document listing)
CREATE INDEX IF NOT EXISTS idx_documents_company_id ON company_documents(company_id);

-- Audit logs (for pagination and time-based queries)
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- Companies: Sector (for dashboard sector distribution)
CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies(sector) WHERE deleted_at IS NULL;

-- =====================================================
-- PARTIAL INDEXES FOR FILTERED QUERIES
-- =====================================================

-- Only index active (non-deleted) records for better performance
CREATE INDEX IF NOT EXISTS idx_units_active ON units(id, block_id, company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leases_active ON leases(id, company_id, start_date, end_date) WHERE deleted_at IS NULL;

-- =====================================================
-- SOFT DELETE SUPPORT INDEXES
-- =====================================================

-- Track deleted records for potential restore
CREATE INDEX IF NOT EXISTS idx_units_deleted_at ON units(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_deleted_at ON companies(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leases_deleted_at ON leases(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blocks_deleted_at ON blocks(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campuses_deleted_at ON campuses(deleted_at) WHERE deleted_at IS NOT NULL;

-- =====================================================
-- COVERING INDEXES (Include commonly accessed columns)
-- =====================================================

-- Units: Cover index for unit detail queries
CREATE INDEX IF NOT EXISTS idx_units_cover ON units(block_id, floor, number, status, area_sqm) WHERE deleted_at IS NULL;

-- Leases: Cover index for lease detail queries
CREATE INDEX IF NOT EXISTS idx_leases_cover ON leases(company_id, monthly_rent, operating_fee, start_date, end_date) WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_units_block_status IS 'Optimizes floor occupancy queries by block and status';
COMMENT ON INDEX idx_audit_logs_timestamp IS 'Optimizes audit log pagination with DESC order';
COMMENT ON INDEX idx_companies_sector IS 'Optimizes dashboard sector distribution queries';
