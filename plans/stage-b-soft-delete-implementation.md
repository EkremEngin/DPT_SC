# Stage B: Soft Delete Architecture Implementation Plan

## Overview
This document outlines the implementation of soft delete architecture for the LeaseGuard system. Instead of permanently deleting records, we mark them as deleted with a `deleted_at` timestamp.

## Affected Tables
- campuses
- blocks
- units
- companies
- leases
- company_score_entries
- company_documents

## Implementation Steps

### Step 1: Create Migration Script
**File:** `server/src/db/migrations/001_add_soft_delete.sql`

Add `deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL` column to all affected tables.

### Step 2: Update SELECT Queries
Add `WHERE deleted_at IS NULL` filter to all SELECT queries in:
- `server/src/routes/campuses.ts`
- `server/src/routes/blocks.ts`
- `server/src/routes/units.ts`
- `server/src/routes/companies.ts`
- `server/src/routes/leases.ts`

### Step 3: Update DELETE Operations
Change DELETE operations to UPDATE `deleted_at = CURRENT_TIMESTAMP` in:
- `server/src/routes/campuses.ts` - DELETE /:id
- `server/src/routes/blocks.ts` - DELETE /:id
- `server/src/routes/units.ts` - DELETE /:id
- `server/src/routes/companies.ts` - DELETE /:id
- `server/src/routes/leases.ts` - DELETE /:id

### Step 4: Create Restore Endpoints
**New File:** `server/src/routes/restore.ts`

Create restore endpoints for each entity type:
- POST /restore/campuses/:id
- POST /restore/blocks/:id
- POST /restore/units/:id
- POST /restore/companies/:id
- POST /restore/leases/:id

Restore operation: `UPDATE table SET deleted_at = NULL WHERE id = $1`

### Step 5: Update Server Index
Register restore routes in `server/src/index.ts`

## Migration Execution
```bash
cd DPT-Local-main/server
psql -h localhost -U app -d appdb -f src/db/migrations/001_add_soft_delete.sql
```

## Testing Checklist
- [ ] Migration runs successfully
- [ ] All SELECT queries filter out deleted records
- [ ] DELETE operations set deleted_at instead of removing rows
- [ ] Restore endpoints work correctly
- [ ] Frontend still works as expected
