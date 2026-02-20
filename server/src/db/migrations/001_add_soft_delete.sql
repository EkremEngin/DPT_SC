-- Migration 001: Add Soft Delete Architecture
-- This migration adds deleted_at columns to all main tables for soft delete functionality
-- Instead of permanently deleting records, we mark them as deleted with a timestamp

-- Add deleted_at column to campuses
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_at column to blocks
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_at column to units
ALTER TABLE units ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_at column to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_at column to leases
ALTER TABLE leases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_at column to company_score_entries
ALTER TABLE company_score_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_at column to company_documents
ALTER TABLE company_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create indexes for deleted_at columns to improve query performance
CREATE INDEX IF NOT EXISTS idx_campuses_deleted_at ON campuses(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blocks_deleted_at ON blocks(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_units_deleted_at ON units(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_deleted_at ON companies(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leases_deleted_at ON leases(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_score_entries_deleted_at ON company_score_entries(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_documents_deleted_at ON company_documents(deleted_at) WHERE deleted_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN campuses.deleted_at IS 'Soft delete timestamp. NULL means record is active, non-NULL means deleted.';
COMMENT ON COLUMN blocks.deleted_at IS 'Soft delete timestamp. NULL means record is active, non-NULL means deleted.';
COMMENT ON COLUMN units.deleted_at IS 'Soft delete timestamp. NULL means record is active, non-NULL means deleted.';
COMMENT ON COLUMN companies.deleted_at IS 'Soft delete timestamp. NULL means record is active, non-NULL means deleted.';
COMMENT ON COLUMN leases.deleted_at IS 'Soft delete timestamp. NULL means record is active, non-NULL means deleted.';
COMMENT ON COLUMN company_score_entries.deleted_at IS 'Soft delete timestamp. NULL means record is active, non-NULL means deleted.';
COMMENT ON COLUMN company_documents.deleted_at IS 'Soft delete timestamp. NULL means record is active, non-NULL means deleted.';
