-- Migration 005: Canon Compliance Updates
-- Adds sectors table, unit price preservation, and standardized unit codes

-- 1. Create sectors table (for dedicated CRUD)
CREATE TABLE IF NOT EXISTS sectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Index for soft delete performance
CREATE INDEX IF NOT EXISTS idx_sectors_deleted_at ON sectors(deleted_at) WHERE deleted_at IS NOT NULL;

-- 2. Populate sectors from existing companies (DISTINCT)
-- Insert only if sector is not null/empty and doesn't exist yet
INSERT INTO sectors (name)
SELECT DISTINCT sector 
FROM companies 
WHERE sector IS NOT NULL AND sector != ''
ON CONFLICT (name) DO NOTHING;

-- 3. Add unit_price_per_sqm to leases (to preserve original price when rent becomes 0)
ALTER TABLE leases ADD COLUMN IF NOT EXISTS unit_price_per_sqm NUMERIC(12, 2) DEFAULT 0;

-- 4. Add campus_code to campuses (for standardized unit numbering: KAMPUSKODU-BLOKKODU...)
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS campus_code VARCHAR(20);
-- Add unique constraint to avoid duplicates
ALTER TABLE campuses ADD CONSTRAINT unique_campus_code UNIQUE (campus_code);

-- 5. Add comments
COMMENT ON TABLE sectors IS 'Definitions for company sectors';
COMMENT ON COLUMN leases.unit_price_per_sqm IS 'Stores the original price per sqm at contract creation, preserved even if monthly rent is zeroed.';
COMMENT ON COLUMN campuses.campus_code IS 'Unique code for campus used in unit number generation (e.g. TEKNOA).';
