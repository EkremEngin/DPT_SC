#!/usr/bin/env ts-node
/**
 * P5.5 Resilience & DR - Restore Drill Test Script
 *
 * Automated verification that backups are restorable and data integrity is maintained.
 * Creates isolated test database, performs restore, validates data, then cleans up.
 *
 * Target RTO: <15 minutes (900 seconds) for full restore + verification
 *
 * Usage:
 *   npm run drill:restore                          # Use latest backup
 *   npm run drill:restore -- --input=backup.sql   # Use specific backup
 *   npm run drill:restore -- --no-cleanup         # Keep test database
 *
 * @phase Phase 5.5 Resilience & Disaster Recovery Drills
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

interface DrillOptions {
  input?: string;          // Path to backup file (optional, uses latest if not specified)
  testDatabase?: string;   // Test database name
  noCleanup?: boolean;     // Don't drop test database after drill
  verbose?: boolean;       // Show detailed output
  outputReport?: string;   // Path for drill report JSON
}

interface DrillResult {
  timestamp: string;
  success: boolean;
  restoreTimeSeconds: number;
  totalTimeSeconds: number;
  backupFile: string;
  testDatabase: string;
  targetRTOSeconds: number;
  passedRTO: boolean;
  verificationChecks: {
    companiesCount: number;
    unitsCount: number;
    campusesCount: number;
    blocksCount: number;
    leasesCount: number;
    auditLogsCount: number;
    usersCount: number;
  };
  integrityChecks: {
    orphanedUnits: number;
    orphanedLeases: number;
    duplicateUsers: number;
  };
  errors: string[];
  warnings: string[];
}

// Default configuration
const DEFAULT_BACKUP_DIR = path.join(process.cwd(), 'backups');
const DEFAULT_TEST_DB = process.env.DRILL_DATABASE || 'dpt_restore_test';
const TARGET_RTO_SECONDS = 900; // 15 minutes

/**
 * Logging functions
 */
function log(message: string, verbose: boolean = false) {
  if (verbose) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
}

function logError(message: string) {
  console.error(`[ERROR] ${message}`);
}

/**
 * Finds the latest backup file
 */
function findLatestBackup(): string | null {
  const backupDir = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;
  
  if (!fs.existsSync(backupDir)) {
    return null;
  }
  
  // Check for symlink to latest
  const latestLink = path.join(backupDir, 'latest.sql.gz');
  if (fs.existsSync(latestLink)) {
    return latestLink;
  }
  
  // Otherwise find most recent .sql file
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz'))
    .map(f => ({
      name: f,
      path: path.join(backupDir, f),
      time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);
  
  return files.length > 0 ? files[0].path : null;
}

/**
 * Gets base connection string without database
 */
function getBaseConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER || 'app';
  
  return `postgresql://${user}@${host}:${port}`;
}

/**
 * Drops the test database if it exists
 */
async function dropTestDatabase(database: string, verbose: boolean = false): Promise<void> {
  log(`Dropping test database: ${database}`, verbose);
  
  const baseConn = getBaseConnectionString();
  const command = `psql "${baseConn}" -c "DROP DATABASE IF EXISTS ${database};"`;
  
  try {
    await execAsync(command);
    log(`✓ Dropped test database`, verbose);
  } catch (error: any) {
    throw new Error(`Failed to drop test database: ${error.stderr || error.message}`);
  }
}

/**
 * Creates the test database
 */
async function createTestDatabase(database: string, verbose: boolean = false): Promise<void> {
  log(`Creating test database: ${database}`, verbose);
  
  const baseConn = getBaseConnectionString();
  const command = `psql "${baseConn}" -c "CREATE DATABASE ${database};"`;
  
  try {
    await execAsync(command);
    log(`✓ Created test database`, verbose);
  } catch (error: any) {
    throw new Error(`Failed to create test database: ${error.stderr || error.message}`);
  }
}

/**
 * Restores the backup to test database
 */
async function performRestore(backupFile: string, database: string, verbose: boolean = false): Promise<number> {
  console.log(`\n🔄 Restoring from: ${backupFile}`);
  console.log(`📝 To database: ${database}`);
  
  const startTime = Date.now();
  
  const baseConn = getBaseConnectionString();
  const fullPath = path.resolve(backupFile);
  
  // Determine if file is gzipped
  const isGzipped = backupFile.endsWith('.gz');
  
  let command: string;
  if (isGzipped) {
    command = `gunzip -c "${fullPath}" | psql "${baseConn}/${database}"`;
  } else {
    command = `psql "${baseConn}/${database}" -f "${fullPath}"`;
  }
  
  if (!verbose) {
    command += ' -q';
  }
  
  console.log('Executing restore...');
  console.log('─'.repeat(60));
  
  try {
    await execAsync(command);
    const duration = (Date.now() - startTime) / 1000;
    console.log('─'.repeat(60));
    console.log(`✓ Restore completed in ${duration.toFixed(2)}s`);
    return duration;
  } catch (error: any) {
    console.log('─'.repeat(60));
    throw new Error(`Restore failed: ${error.stderr || error.message}`);
  }
}

/**
 * Runs verification queries on the restored database
 */
async function runVerificationChecks(database: string, verbose: boolean = false): Promise<{
  counts: DrillResult['verificationChecks'];
  integrity: DrillResult['integrityChecks'];
}> {
  console.log('\n🔍 Running verification checks...');
  
  const baseConn = getBaseConnectionString();
  
  const counts: DrillResult['verificationChecks'] = {
    companiesCount: 0,
    unitsCount: 0,
    campusesCount: 0,
    blocksCount: 0,
    leasesCount: 0,
    auditLogsCount: 0,
    usersCount: 0
  };
  
  const integrity: DrillResult['integrityChecks'] = {
    orphanedUnits: 0,
    orphanedLeases: 0,
    duplicateUsers: 0
  };
  
  // Get row counts
  const countQueries = [
    { table: 'companies', key: 'companiesCount' },
    { table: 'units', key: 'unitsCount' },
    { table: 'campuses', key: 'campusesCount' },
    { table: 'blocks', key: 'blocksCount' },
    { table: 'leases', key: 'leasesCount' },
    { table: 'audit_logs', key: 'auditLogsCount' },
    { table: 'users', key: 'usersCount' }
  ];
  
  for (const { table, key } of countQueries) {
    try {
      const command = `psql "${baseConn}/${database}" -t -c "SELECT COUNT(*) FROM ${table} WHERE deleted_at IS NULL;"`;
      const { stdout } = await execAsync(command);
      const count = parseInt(stdout.trim()) || 0;
      counts[key as keyof DrillResult['verificationChecks']] = count;
      console.log(`  ✓ ${table}: ${count} records`);
    } catch (err) {
      console.log(`  ⚠ ${table}: N/A (table may not exist)`);
    }
  }
  
  // Check for orphaned records
  try {
    const orphanedUnitsQuery = `
      SELECT COUNT(*) FROM units u
      LEFT JOIN blocks b ON u.block_id = b.id
      WHERE b.id IS NULL AND u.deleted_at IS NULL AND u.block_id IS NOT NULL;
    `;
    const command = `psql "${baseConn}/${database}" -t -c "${orphanedUnitsQuery}"`;
    const { stdout } = await execAsync(command);
    integrity.orphanedUnits = parseInt(stdout.trim()) || 0;
    console.log(`  Integrity: ${integrity.orphanedUnits} orphaned units`);
  } catch (err) {
    log('Could not check for orphaned units', verbose);
  }
  
  try {
    const orphanedLeasesQuery = `
      SELECT COUNT(*) FROM leases l
      LEFT JOIN companies c ON l.company_id = c.id
      WHERE c.id IS NULL AND l.deleted_at IS NULL AND l.company_id IS NOT NULL;
    `;
    const command = `psql "${baseConn}/${database}" -t -c "${orphanedLeasesQuery}"`;
    const { stdout } = await execAsync(command);
    integrity.orphanedLeases = parseInt(stdout.trim()) || 0;
    console.log(`  Integrity: ${integrity.orphanedLeases} orphaned leases`);
  } catch (err) {
    log('Could not check for orphaned leases', verbose);
  }
  
  try {
    const duplicateUsersQuery = `
      SELECT COUNT(*) FROM (
        SELECT username, COUNT(*) as cnt FROM users GROUP BY username HAVING COUNT(*) > 1
      ) d;
    `;
    const command = `psql "${baseConn}/${database}" -t -c "${duplicateUsersQuery}"`;
    const { stdout } = await execAsync(command);
    integrity.duplicateUsers = parseInt(stdout.trim()) || 0;
    console.log(`  Integrity: ${integrity.duplicateUsers} duplicate usernames`);
  } catch (err) {
    log('Could not check for duplicate users', verbose);
  }
  
  return { counts, integrity };
}

/**
 * Main drill execution
 */
async function runDrill(options: DrillOptions): Promise<DrillResult> {
  const startTime = Date.now();
  const testDatabase = options.testDatabase || DEFAULT_TEST_DB;
  
  console.log('='.repeat(60));
  console.log('🔥 P5.5 Disaster Recovery Drill Test');
  console.log('='.repeat(60));
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Target RTO: ${TARGET_RTO_SECONDS}s (${TARGET_RTO_SECONDS / 60} minutes)`);
  
  const result: DrillResult = {
    timestamp: new Date().toISOString(),
    success: false,
    restoreTimeSeconds: 0,
    totalTimeSeconds: 0,
    backupFile: '',
    testDatabase,
    targetRTOSeconds: TARGET_RTO_SECONDS,
    passedRTO: false,
    verificationChecks: {
      companiesCount: 0,
      unitsCount: 0,
      campusesCount: 0,
      blocksCount: 0,
      leasesCount: 0,
      auditLogsCount: 0,
      usersCount: 0
    },
    integrityChecks: {
      orphanedUnits: 0,
      orphanedLeases: 0,
      duplicateUsers: 0
    },
    errors: [],
    warnings: []
  };
  
  // Determine which backup file to use
  let backupFile: string | undefined = options.input;
  if (!backupFile) {
    const latestBackup = findLatestBackup();
    if (!latestBackup) {
      result.errors.push('No backup file found');
      console.error('✗ No backup file found in backup directory');
      return result;
    }
    backupFile = latestBackup;
    console.log(`Using latest backup: ${backupFile}`);
  }
  
  result.backupFile = backupFile;
  
  // Verify backup file exists
  if (!fs.existsSync(backupFile)) {
    result.errors.push(`Backup file not found: ${backupFile}`);
    console.error(`✗ Backup file not found: ${backupFile}`);
    return result;
  }
  
  const fileSizeMB = (fs.statSync(backupFile).size / (1024 * 1024)).toFixed(2);
  console.log(`Backup file: ${backupFile} (${fileSizeMB} MB)`);
  
  try {
    // Clean up any existing test database
    await dropTestDatabase(testDatabase, options.verbose);
    
    // Create fresh test database
    await createTestDatabase(testDatabase, options.verbose);
    
    // Perform restore
    const restoreStart = Date.now();
    result.restoreTimeSeconds = await performRestore(backupFile, testDatabase, options.verbose);
    
    // Run verification checks
    const { counts, integrity } = await runVerificationChecks(testDatabase, options.verbose);
    result.verificationChecks = counts;
    result.integrityChecks = integrity;
    
    // Calculate total time
    result.totalTimeSeconds = (Date.now() - startTime) / 1000;
    
    // Check if RTO was met
    result.passedRTO = result.totalTimeSeconds <= TARGET_RTO_SECONDS;
    
    // Check for issues
    if (integrity.orphanedUnits > 0) {
      result.warnings.push(`${integrity.orphanedUnits} orphaned units found`);
    }
    if (integrity.orphanedLeases > 0) {
      result.warnings.push(`${integrity.orphanedLeases} orphaned leases found`);
    }
    if (integrity.duplicateUsers > 0) {
      result.errors.push(`${integrity.duplicateUsers} duplicate usernames found`);
    }
    
    // Success if no critical errors
    result.success = result.errors.length === 0;
    
    // Cleanup unless requested to keep
    if (!options.noCleanup) {
      console.log('\n🧹 Cleaning up test database...');
      await dropTestDatabase(testDatabase, options.verbose);
      console.log('✓ Test database cleaned up');
    } else {
      console.log(`\n⚠️  Test database kept: ${testDatabase}`);
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Drill Summary');
    console.log('='.repeat(60));
    console.log(`Total time: ${result.totalTimeSeconds.toFixed(2)}s`);
    console.log(`Restore time: ${result.restoreTimeSeconds.toFixed(2)}s`);
    console.log(`RTO target: ${TARGET_RTO_SECONDS}s`);
    console.log(`RTO status: ${result.passedRTO ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }
    
    console.log('='.repeat(60));
    
    return result;
    
  } catch (error: any) {
    result.errors.push(error.message);
    result.totalTimeSeconds = (Date.now() - startTime) / 1000;
    console.error('\n✗ Drill failed:');
    console.error(error.message);
    return result;
  }
}

/**
 * Saves drill report to file
 */
function saveDrillReport(result: DrillResult, reportPath: string): void {
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
  console.log(`\n📝 Report saved to: ${reportPath}`);
}

/**
 * Parses command line arguments
 */
function parseArgs(args: string[]): DrillOptions {
  const options: DrillOptions = {};
  
  for (const arg of args) {
    if (arg.startsWith('--input=')) {
      options.input = arg.split('=')[1];
    } else if (arg.startsWith('--database=')) {
      options.testDatabase = arg.split('=')[1];
    } else if (arg === '--no-cleanup') {
      options.noCleanup = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg.startsWith('--report=')) {
      options.outputReport = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
DPT-Local Disaster Recovery Drill Test

Automated backup verification and restore testing.

Usage:
  npm run drill:restore                          # Use latest backup
  npm run drill:restore -- --input=backup.sql   # Use specific backup
  npm run drill:restore -- --no-cleanup         # Keep test database

Options:
  --input=<file>          Path to backup SQL file (default: latest)
  --database=<name>       Test database name (default: dpt_restore_test)
  --no-cleanup            Don't drop test database after drill
  --verbose               Show detailed output
  --report=<path>         Save drill report to file
  --help, -h              Show this help

Target RTO: 15 minutes (900 seconds)

Examples:
  npm run drill:restore
  npm run drill:restore -- --input=backups/latest.sql.gz --verbose
  npm run drill:restore -- --no-cleanup --report=docs/drill-logs/drill.json
      `);
      process.exit(0);
    }
  }
  
  return options;
}

/**
 * Main execution
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    const options = parseArgs(args);
    
    const result = await runDrill(options);
    
    // Save report if requested
    if (options.outputReport) {
      saveDrillReport(result, options.outputReport);
    }
    
    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    console.error('\nDrill script terminated with errors');
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { runDrill, DrillOptions, DrillResult };
