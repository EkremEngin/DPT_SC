/**
 * Phase 5.2 Database Optimization Validation
 * 
 * Evidence-grade validation artifacts
 * 
 * Collects:
 * - PostgreSQL version and DB info
 * - EXPLAIN ANALYZE for key queries
 * - Index usage statistics
 * - Performance test results
 */

import { query } from '../db/index';

interface ValidationResults {
  pgVersion: string;
  dbName: string;
  dbUser: string;
  explainPlans: Record<string, any>;
  indexUsage: any[];
  tableStats: any[];
}

async function getPGInfo() {
  const result = await query(`
    SELECT version(), current_database(), current_user
  `);
  return {
    version: result.rows[0].version,
    database: result.rows[0].current_database,
    user: result.rows[0].current_user
  };
}

async function explainAnalyze(name: string, sql: string) {
  const result = await query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`);
  return {
    name,
    query: sql,
    plan: result.rows.map((r: any) => r['QUERY PLAN']).join('\n')
  };
}

async function getIndexUsage() {
  const result = await query(`
    SELECT
      schemaname,
      relname AS table_name,
      indexrelname AS index_name,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch
    FROM pg_stat_user_indexes
    WHERE indexrelname LIKE 'idx_%'
    ORDER BY idx_scan DESC
  `);
  return result.rows;
}

async function getTableStats() {
  const result = await query(`
    SELECT
      schemaname,
      relname,
      seq_scan,
      seq_tup_read,
      idx_scan,
      idx_tup_fetch
    FROM pg_stat_user_tables
    WHERE relname IN ('leases', 'units', 'companies', 'blocks', 'campuses', 'audit_logs')
    ORDER BY seq_scan DESC
  `);
  return result.rows;
}

async function main() {
  console.log('=== Phase 5.2 Validation - Evidence Collection ===\n');

  // PART 1: PostgreSQL Info
  console.log('PART 1: PostgreSQL Version + DB Info');
  console.log('======================================');
  const pgInfo = await getPGInfo();
  console.log(`PostgreSQL: ${pgInfo.version}`);
  console.log(`Database: ${pgInfo.database}`);
  console.log(`User: ${pgInfo.user}`);
  console.log('');

  // PART 2: Query Plans
  console.log('PART 2: EXPLAIN ANALYZE Results');
  console.log('================================\n');

  const plans: Record<string, any> = {};

  // Q1: Dashboard Revenue Query
  console.log('Q1: Dashboard Revenue Query');
  console.log('----------------------------');
  plans.q1 = await explainAnalyze(
    'Dashboard Revenue',
    `
      SELECT 
        COALESCE(SUM(l.monthly_rent + COALESCE(l.operating_fee, 0)), 0) as revenue
      FROM leases l
      WHERE l.deleted_at IS NULL
    `
  );
  console.log(plans.q1.plan);
  console.log('');

  // Q2: Dashboard Occupancy Query
  console.log('Q2: Dashboard Occupancy Query');
  console.log('------------------------------');
  plans.q2 = await explainAnalyze(
    'Dashboard Occupancy',
    `
      SELECT 
        COUNT(DISTINCT u.company_id) as occupied_count,
        COALESCE(SUM(u.area_sqm), 0) as occupied_area
      FROM units u
      WHERE u.status = 'OCCUPIED' AND u.deleted_at IS NULL
    `
  );
  console.log(plans.q2.plan);
  console.log('');

  // Q3: Lease Details (5-table join)
  console.log('Q3: Lease Details (5-table JOIN)');
  console.log('----------------------------------');
  plans.q3 = await explainAnalyze(
    'Lease Details',
    `
      SELECT c.id as company_id, c.name,
             l.id as lease_id, l.start_date, l.end_date, l.monthly_rent,
             u.id as unit_id, u.number, u.floor,
             b.id as block_id, b.name as block_name,
             cp.id as campus_id, cp.name as campus_name
      FROM companies c
      LEFT JOIN leases l ON l.company_id = c.id AND l.deleted_at IS NULL
      LEFT JOIN units u ON u.company_id = c.id AND u.deleted_at IS NULL
      LEFT JOIN blocks b ON u.block_id = b.id AND b.deleted_at IS NULL
      LEFT JOIN campuses cp ON b.campus_id = cp.id AND cp.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      LIMIT 10
    `
  );
  console.log(plans.q3.plan);
  console.log('');

  // Q4: Unit Assignment Lookup
  console.log('Q4: Unit Assignment Lookup');
  console.log('--------------------------');
  plans.q4 = await explainAnalyze(
    'Unit Lookup',
    `
      SELECT u.id, u.number, u.floor, u.area_sqm, u.status
      FROM units u
      WHERE u.deleted_at IS NULL
        AND u.floor = 1
      ORDER BY u.block_id, u.number
      LIMIT 20
    `
  );
  console.log(plans.q4.plan);
  console.log('');

  // Q5: Expiring Leases
  console.log('Q5: Expiring Leases Query');
  console.log('-------------------------');
  plans.q5 = await explainAnalyze(
    'Expiring Leases',
    `
      SELECT l.id, l.end_date, c.name
      FROM leases l
      JOIN companies c ON c.id = l.company_id AND c.deleted_at IS NULL
      WHERE l.deleted_at IS NULL
        AND l.end_date >= CURRENT_DATE
      ORDER BY l.end_date DESC
      LIMIT 20
    `
  );
  console.log(plans.q5.plan);
  console.log('');

  // PART 3: Index Usage Stats
  console.log('PART 3: Index Usage Statistics');
  console.log('================================\n');
  console.log('A. Index Scan Counts (desc):');
  console.log('-----------------------------');
  const indexUsage = await getIndexUsage();
  console.table(indexUsage);
  console.log('');

  console.log('B. Table Seq vs Index Scans:');
  console.log('----------------------------');
  const tableStats = await getTableStats();
  console.table(tableStats);
  console.log('');

  // PART 4: Phase 5.2 Index Verification
  console.log('PART 4: Phase 5.2 Indexes Created');
  console.log('==================================\n');
  const phase5Indexes = [
    'idx_dashboard_revenue',
    'idx_dashboard_occupancy',
    'idx_campus_breakdown',
    'idx_leases_details_companies',
    'idx_leases_details_units',
    'idx_units_block_floor_number',
    'idx_units_vacant',
    'idx_units_occupied',
    'idx_companies_search',
    'idx_leases_expiring',
    'idx_audit_logs_user_timestamp'
  ];

  const existingIndexes = indexUsage.map((i: any) => i.index_name);
  console.log('Phase 5.2 Index Status:');
  phase5Indexes.forEach(idx => {
    const exists = existingIndexes.includes(idx);
    const usage = indexUsage.find((i: any) => i.index_name === idx);
    const scans = usage ? usage.idx_scan : 0;
    console.log(`  ${exists ? '✓' : '✗'} ${idx} - scans: ${scans}`);
  });
  console.log('');

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`Total Phase 5.2 indexes: ${phase5Indexes.length}`);
  console.log(`Indexes found in DB: ${phase5Indexes.filter(i => existingIndexes.includes(i)).length}`);
  console.log('');
  console.log('Next: Run "npm run perf:run" for performance metrics');

  process.exit(0);
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
