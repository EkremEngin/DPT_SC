# Database Migration Log

This document tracks all database migrations for DPT-Local.

## Migration Rules

1. **Immutable**: Never modify existing migration files
2. **Sequential**: Always use incremental numbering (001, 002, 003...)
3. **Descriptive**: Filenames should clearly indicate purpose
4. **Tested**: Test migrations on staging before production
5. **Rollback**: Document rollback procedure for each migration

---

## Migration History

### 001_add_soft_delete.sql
**Date**: Phase 3 (Completed)
**Purpose**: Add soft delete capability to all entities

**Tables Modified**:
- `campuses` - Added `deleted_at` TIMESTAMP
- `blocks` - Added `deleted_at` TIMESTAMP
- `units` - Added `deleted_at` TIMESTAMP
- `companies` - Added `deleted_at` TIMESTAMP
- `leases` - Added `deleted_at` TIMESTAMP
- `users` - Added `deleted_at` TIMESTAMP
- `sectors` - Added `deleted_at` TIMESTAMP
- `documents` - Added `deleted_at` TIMESTAMP

**Rollback**: Set `deleted_at` to NULL, then drop column

---

### 002_add_performance_indexes.sql
**Date**: Phase 3 (Completed)
**Purpose**: Add database indexes for query optimization

**Indexes Created** (21 total):

**Campuses** (2):
- `idx_campuses_deleted_at`
- `idx_campuses_name`

**Blocks** (4):
- `idx_blocks_campus_id`
- `idx_blocks_deleted_at`
- `idx_blocks_name`
- `idx_blocks_json_path`

**Units** (5):
- `idx_units_block_id`
- `idx_units_deleted_at`
- `idx_units_company_id`
- `idx_units_occupied`
- `idx_units_json_path`

**Companies** (4):
- `idx_companies_sector_id`
- `idx_companies_deleted_at`
- `idx_companies_name`
- `idx_companies_campus_id`

**Leases** (3):
- `idx_leases_company_id`
- `idx_leases_deleted_at`
- `idx_leases_end_date`

**Audit Logs** (3):
- `idx_audit_logs_table_name`
- `idx_audit_logs_entity_id`
- `idx_audit_logs_created_at`

**Rollback**: Drop each index with `DROP INDEX CONCURRENTLY`

---

### 003_add_audit_append_only_trigger.sql
**Date**: Phase 3 (Completed)
**Purpose**: Make audit_logs table append-only (tamper-proof)

**Changes**:
- Created `audit_id_sequence` for immutable IDs
- Added trigger to prevent UPDATE/DELETE on audit_logs
- Audit logs can only be inserted, never modified

**Rollback**: Drop trigger and sequence

---

### 004_add_phase5_indexes.sql
**Date**: Phase 5.2 (February 18, 2026)
**Purpose**: Phase 5.2 Database Optimization - Targeted indexes based on P5.1 baseline analysis

**Indexes Created** (11 total):

**Dashboard Optimization** (3):
- `idx_dashboard_revenue` - Covers monthly_rent, operating_fee for revenue aggregation
- `idx_dashboard_occupancy` - Partial index for occupied units (status='OCCUPIED')
- `idx_campus_breakdown` - Covers campus_id → blocks join for campus breakdown

**Leases Details Optimization** (2):
- `idx_leases_details_companies` - Covering index for company data in 5-table join
- `idx_leases_details_units` - Covering index for unit data in lease details join

**Unit Search Optimization** (3):
- `idx_units_block_floor_number` - Covers block_id, floor, number for unit lookup
- `idx_units_vacant` - Partial index for vacant units (status='VACANT')
- `idx_units_occupied` - Partial index for occupied units by company

**Search & Filter Optimization** (2):
- `idx_companies_search` - Covers name, manager_name, sector for company search
- `idx_leases_expiring` - Partial index for active leases ordered by end_date

**Audit Log Optimization** (1):
- `idx_audit_logs_user_timestamp` - Covers user_name, timestamp for audit trail pagination

**Expected Performance Improvements**:
- Dashboard: ~60% faster (150-200ms → 50-80ms)
- Leases/details: ~60% faster (200-300ms → 80-120ms)
- Unit lookup: ~75% faster (20-40ms → 5-10ms)
- Company search: ~70% faster (50-100ms → 15-30ms)
- Expiring leases: ~80% faster (100-150ms → 20-40ms)

**Rollback**: Drop each index with `DROP INDEX CONCURRENTLY`

---

## Future Migrations

### 005_add_user_preferences.sql (Planned - Phase 4+)
**Purpose**: Add user preferences table for UI settings

**Planned Structure**:
```sql
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    theme VARCHAR(20) DEFAULT 'light',
    language VARCHAR(10) DEFAULT 'tr',
    notification_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);
```

---

### 006_add_notification_system.sql (Planned - Phase 4+)
**Purpose**: Add notification system for lease expirations, etc.

**Planned Structure**:
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read) WHERE read = false;
```

---

## Pre-Deployment Checklist

Before running migrations in production:

- [ ] Migration tested on staging environment
- [ ] Rollback procedure documented
- [ ] Database backup created before migration
- [ ] Migration duration estimated (should be < 5 minutes)
- [ ] Application compatibility verified
- [ ] Monitoring configured during migration

---

## Running Migrations

### All Migrations
```bash
cd server
npm run db:migrate:all
```

### Individual Migration
```bash
psql -U app -d appdb -f src/db/migrations/004_*.sql
```

### Verify Migration
```bash
psql -U app -d appdb -c "\dt"  # List tables
psql -U app -d appdb -c "\di"  # List indexes
```

---

## Rollback Procedure

1. **Stop the application**
2. **Restore database from backup** (preferred)
   ```bash
   pg_dump appdb > backup_before_rollback.sql
   psql appdb < backup_before_migration.sql
   ```

3. **Or run rollback SQL** (if available)
   ```bash
   psql -U app -d appdb -f src/db/migrations/rollback/004_*.sql
   ```

4. **Verify application works**
5. **Start the application**

---

## Migration Statistics

| Metric | Value |
|--------|-------|
| Total Migrations | 4 |
| Tables Modified | 8 |
| Indexes Created | 32 (21 + 11 Phase 5) |
| Triggers Added | 1 |
| Estimated Rollback Time | 5-10 minutes |

---

**Last Updated**: Phase 5.2 Complete (February 18, 2026)
**Next Migration**: TBD
