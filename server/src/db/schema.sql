-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Campuses
CREATE TABLE IF NOT EXISTS campuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    max_office_cap INTEGER NOT NULL DEFAULT 0,
    max_area_cap NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_floors_cap INTEGER NOT NULL DEFAULT 0,
    campus_code VARCHAR(20) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Blocks
CREATE TABLE IF NOT EXISTS blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    max_floors INTEGER NOT NULL DEFAULT 0,
    max_offices INTEGER NOT NULL DEFAULT 0,
    max_area_sqm NUMERIC(10, 2) NOT NULL DEFAULT 0,
    default_operating_fee NUMERIC(10, 2) DEFAULT 400,
    sqm_per_employee NUMERIC(5, 2) DEFAULT 5.0,
    floor_capacities JSONB DEFAULT '[]', -- Stores array of { floor: string, totalSqM: number }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Companies
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    registration_number VARCHAR(100),
    sector VARCHAR(255) DEFAULT 'Yazılım ve Bilişim Hizmetleri',
    business_areas TEXT[] DEFAULT ARRAY[]::TEXT[],
    work_area VARCHAR(255),
    manager_name VARCHAR(255),
    manager_phone VARCHAR(50),
    manager_email VARCHAR(255),
    employee_count INTEGER DEFAULT 0,
    score NUMERIC(5, 2) DEFAULT 0,
    contract_template JSONB, -- Stores { rentPerSqM, startDate, endDate }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Sectors
CREATE TABLE IF NOT EXISTS sectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS business_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Score Entries (History of company scores)
CREATE TABLE IF NOT EXISTS company_score_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    points NUMERIC(5, 2) NOT NULL,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    note TEXT,
    documents JSONB DEFAULT '[]',
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Company Documents
CREATE TABLE IF NOT EXISTS company_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Units (Offices)
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    number VARCHAR(50) NOT NULL,
    floor VARCHAR(50) NOT NULL,
    area_sqm NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'VACANT', -- VACANT, OCCUPIED, MAINTENANCE, RESERVED
    is_maintenance BOOLEAN DEFAULT FALSE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL, -- Current occupant
    reservation_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    reservation_fee NUMERIC(10, 2),
    reserved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Leases (Contracts)
CREATE TABLE IF NOT EXISTS leases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID REFERENCES units(id) ON DELETE SET NULL, -- Can be null if "unallocated" but active contract
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    start_date DATE,
    end_date DATE,
    monthly_rent NUMERIC(12, 2) NOT NULL DEFAULT 0,
    operating_fee NUMERIC(12, 2),
    contract_url TEXT,
    documents JSONB DEFAULT '[]',
    unit_price_per_sqm NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id UUID DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    entity_type VARCHAR(50) NOT NULL, -- LEASE, UNIT, BLOCK, CAMPUS, COMPANY, AUTH
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN
    details TEXT,
    user_name VARCHAR(255) DEFAULT 'System',
    user_role VARCHAR(50),
    rollback_data JSONB,
    impact TEXT
);

-- Indexes for performance
CREATE INDEX idx_units_block_id ON units(block_id);
CREATE INDEX idx_units_company_id ON units(company_id);
CREATE INDEX idx_leases_company_id ON leases(company_id);
CREATE INDEX idx_leases_unit_id ON leases(unit_id);
CREATE INDEX idx_blocks_campus_id ON blocks(campus_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sectors_deleted_at ON sectors(deleted_at) WHERE deleted_at IS NOT NULL;

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'VIEWER', -- ADMIN, MANAGER, VIEWER
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

