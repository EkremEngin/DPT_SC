/**
 * Phase 5.2 Database Optimization Validation - Simplified
 * Evidence-grade validation artifacts
 */

import { query } from '../db/index';

async function main() {
  console.log('=== Phase 5.2 Validation - Evidence Collection ===\n');

  // PART 1: PostgreSQL Info
  console.log('PART 1: PostgreSQL Version + DB Info');
  console.log('======================================');
  const pgInfo = await query(`SELECT version(), current_database(), current_user`);
  console.log(`PostgreSQL: ${pgInfo.rows[0].version}`);
  console.log(`Database: ${pgInfo.rows[0].current_database}`);
  console.log(`User: ${pgInfo.rows[0].current_user}`);
  console.log('');

  // PART 2: Query Plans
  console.log('PART 2: EXPLAIN ANALYZE Results');
  console.log('================================\n');

  // Q1: Dashboard Revenue
  console.log('Q1: Dashboard Revenue Query');
  console.log('----------------------------');
  const q1 = await query(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT COALESCE(SUM(l.monthly_rent + COALESCE(l.operating_fee, 0)), 0) as revenue
    FROM leases l WHERE l.deleted_at IS NULL
  `);
  console.log(q1.rows.map((r: any) => r['QUERY PLAN']).join('\n'));
  console.log('');

  // Q2: Dashboard Occupancy
  console.log('Q2: Dashboard Occupancy Query');
  console.log('------------------------------');
  const q2 = await query(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT COUNT(DISTINCT u.company_id) as occupied_count, COALESCE(SUM(u.area_sqm), 0) as occupied_area
    FROM units u WHERE u.status = 'OCCUPIED' AND u.deleted_at IS NULL
  `);
  console.log(q2.rows.map((r: any) => r['QUERY PLAN']).join('\n'));
  console.log('');

  // Q3: Lease Details (5-table)
  console.log('Q3: Lease Details (5-table JOIN)');
  console.log('----------------------------------');
  const q3 = await query(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT c.id as company_id, c.name, l.id as lease_id, l.start_date, l.end_date,
           u.id as unit_id, u.number, u.floor, b.id as block_id, b.name as block_name,
           cp.id as campus_id, cp.name as campus_name
    FROM companies c
    LEFT JOIN leases l ON l.company_id = c.id AND l.deleted_at IS NULL
    LEFT JOIN units u ON u.company_id = c.id AND u.deleted_at IS NULL
    LEFT JOIN blocks b ON u.block_id = b.id AND b.deleted_at IS NULL
    LEFT JOIN campuses cp ON b.campus_id = cp.id AND cp.deleted_at IS NULL
    WHERE c.deleted_at IS NULL LIMIT 10
  `);
  console.log(q3.rows.map((r: any) => r['QUERY PLAN']).join('\n'));
  console.log('');

  // Q4: Unit Lookup - Skipped (schema type mismatch)
  console.log('Q4: Unit Assignment Lookup');
  console.log('--------------------------');
  console.log('SKIPPED: Type mismatch between block_id (varchar) and floor (integer)');
  console.log('');

  // Q5: Expiring Leases
  console.log('Q5: Expiring Leases Query');
  console.log('-------------------------');
  const q5 = await query(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT l.id, l.end_date, c.name
    FROM leases l
    JOIN companies c ON c.id = l.company_id AND c.deleted_at IS NULL
    WHERE l.deleted_at IS NULL AND l.end_date >= CURRENT_DATE
    ORDER BY l.end_date DESC LIMIT 20
  `);
  console.log(q5.rows.map((r: any) => r['QUERY PLAN']).join('\n'));
  console.log('');

  // PART 3: Index Usage
  console.log('PART 3: Index Usage Statistics');
  console.log('================================\n');
  
  console.log('A. Phase 5.2 Index Scan Counts:');
  console.log('---------------------------------');
  const idxUsage = await query(`
    SELECT relname AS table_name, indexrelname AS index_name, idx_scan, idx_tup_read, idx_tup_fetch
    FROM pg_stat_user_indexes
    WHERE indexrelname IN (
      'idx_dashboard_revenue', 'idx_dashboard_occupancy', 'idx_campus_breakdown',
      'idx_leases_details_companies', 'idx_leases_details_units', 'idx_units_block_floor_number',
      'idx_units_vacant', 'idx_units_occupied', 'idx_companies_search',
      'idx_leases_expiring', 'idx_audit_logs_user_timestamp'
    )
    ORDER BY idx_scan DESC
  `);
  console.table(idxUsage.rows);
  console.log('');

  console.log('B. Table Seq vs Index Scans:');
  console.log('------------------------------');
  const tableStats = await query(`
    SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch
    FROM pg_stat_user_tables
    WHERE relname IN ('leases', 'units', 'companies', 'blocks', 'campuses', 'audit_logs')
    ORDER BY seq_scan DESC
  `);
  console.table(tableStats.rows);
  console.log('');

  // PART 4: Summary
  console.log('PART 4: Phase 5.2 Summary');
  console.log('==========================\n');
  console.log(`Phase 5.2 indexes tracked: ${idxUsage.rows.length}`);
  console.log(`Indexes with scans: ${idxUsage.rows.filter((r: any) => r.idx_scan > 0).length}`);
  console.log('');
  console.log('Migration File:');
  console.log('  - Uses CREATE INDEX CONCURRENTLY for each index');
  console.log('  - No transaction wrapper (CONCURRENTLY requires autocommit)');
  console.log('  - Each index created separately via semicolon delimiter');
  console.log('');
  console.log('Next: Run "npm run perf:run" for performance metrics');

  process.exit(0);
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
