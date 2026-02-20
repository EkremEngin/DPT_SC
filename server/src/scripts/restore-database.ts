#!/usr/bin/env ts-node
/**
 * P5.5 Resilience & Disaster Recovery - Database Restore Script
 *
 * Companion to backup-database.ts that restores PostgreSQL databases
 * from SQL backup files created by pg_dump.
 *
 * Usage:
 *   npm run restore -- --input=backup.sql                    # Basic restore
 *   npm run restore -- --input=backup.sql --drop-existing    # Drop existing DB
 *   npm run restore -- --input=backup.sql --database=testdb  # Restore to different DB
 *   npm run restore -- --input=backup.sql --dry-run          # Validate only
 *
 * @phase Phase 5.5 Resilience & Disaster Recovery Drills
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import dotenv from 'dotenv';
import { BackupLock } from './backup-lock';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

interface RestoreOptions {
  input: string;           // Path to backup file (required)
  database?: string;       // Target database name (defaults to env)
  dropExisting?: boolean;  // Drop existing database before restore
  createIfMissing?: boolean; // Create database if doesn't exist
  verbose?: boolean;       // Show psql output
  dryRun?: boolean;        // Validate file only, don't restore
  allowProduction?: boolean; // Allow restore to production database
  force?: boolean;         // Required with --drop-existing
  nonInteractive?: boolean; // Skip confirmations
  execute?: boolean;       // Actually perform restore (default is dry-run)
}

interface RestoreResult {
  success: boolean;
  restoreTimeSeconds: number;
  input: string;
  database: string;
  fileExists: boolean;
  fileSizeBytes: number;
  rowCounts?: Record<string, number>;
  error?: string;
  warnings?: string[];
}

// Default values
const DEFAULT_BACKUP_DIR = path.join(process.cwd(), 'backups');

/**
 * Validates that the backup file exists and is readable
 */
function validateBackupFile(filePath: string): { exists: boolean; size: number; error?: string } {
  const resolvedPath = path.resolve(filePath);
  
  if (!fs.existsSync(resolvedPath)) {
    return {
      exists: false,
      size: 0,
      error: `Backup file not found: ${resolvedPath}`
    };
  }
  
  const stats = fs.statSync(resolvedPath);
  
  if (!stats.isFile()) {
    return {
      exists: false,
      size: 0,
      error: `Path is not a file: ${resolvedPath}`
    };
  }
  
  if (stats.size === 0) {
    return {
      exists: true,
      size: 0,
      error: `Backup file is empty: ${resolvedPath}`
    };
  }
  
  // Try to read first few bytes to validate it's a text file
  try {
    const fd = fs.openSync(resolvedPath, 'r');
    const buffer = Buffer.alloc(100);
    fs.readSync(fd, buffer, 0, 100, 0);
    fs.closeSync(fd);
    
    const content = buffer.toString('utf8');
    
    // Basic SQL file validation
    if (!content.includes('--') && !content.includes('CREATE') && !content.includes('BEGIN')) {
      return {
        exists: true,
        size: stats.size,
        error: `File does not appear to be a valid SQL dump: ${resolvedPath}`
      };
    }
  } catch (err) {
    return {
      exists: true,
      size: stats.size,
      error: `Cannot read backup file: ${err}`
    };
  }
  
  return {
    exists: true,
    size: stats.size
  };
}

/**
 * Lists available backup files in the backup directory
 */
function listAvailableBackups(): string[] {
  const backupDir = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;
  
  if (!fs.existsSync(backupDir)) {
    return [];
  }
  
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz'))
    .sort()
    .reverse();
  
  return files.map(f => path.join(backupDir, f));
}

/**
 * Gets the connection string without database name
 */
function getBaseConnectionString(): string {
  if (process.env.DATABASE_URL) {
    // Remove database name from URL if present
    const url = process.env.DATABASE_URL;
    const masked = url.replace(/:([^:@]{4,})@/, ':****@');
    console.log(`Using DATABASE_URL: ${masked}`);
    return process.env.DATABASE_URL;
  }
  
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER || 'app';
  
  return `postgresql://${user}@${host}:${port}`;
}

/**
 * Gets the target database name
 */
function getTargetDatabase(options: RestoreOptions): string {
  if (options.database) {
    return options.database;
  }
  
  // Try to extract from DATABASE_URL
  if (process.env.DATABASE_URL) {
    const match = process.env.DATABASE_URL.match(/\/([^/?]+)$/);
    if (match) {
      return match[1];
    }
  }
  
  return process.env.DB_NAME || 'appdb';
}

/**
 * Checks if the target database is a read replica
 */
async function checkIfReplica(database: string): Promise<boolean> {
  try {
    const baseConn = getBaseConnectionString();
    const command = `psql "${baseConn}/${database}" -t -c "SELECT pg_is_in_recovery();"`;
    const { stdout } = await execAsync(command);
    return stdout.trim() === 't';
  } catch {
    return false;
  }
}

/**
 * Terminates active connections to the database
 */
async function terminateConnections(database: string): Promise<void> {
  console.log(`\n🔌 Terminating active connections to: ${database}`);
  
  const baseConn = getBaseConnectionString();
  const command = `psql "${baseConn}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid();"`;
  
  try {
    await execAsync(command);
    console.log(`✓ Active connections terminated`);
  } catch (error: any) {
    // Non-fatal - might just mean no connections
    console.log(`ℹ️  Note: ${error.message || 'No connections to terminate'}`);
  }
}

/**
 * Drops the target database if it exists
 */
async function dropDatabase(database: string): Promise<void> {
  console.log(`\n⚠️  Dropping database: ${database}`);
  
  const baseConn = getBaseConnectionString();
  const command = `psql "${baseConn}" -c "DROP DATABASE IF EXISTS ${database};"`;
  
  try {
    await execAsync(command);
    console.log(`✓ Database dropped: ${database}`);
  } catch (error: any) {
    throw new Error(`Failed to drop database: ${error.stderr || error.message}`);
  }
}

/**
 * Creates a new database
 */
async function createDatabase(database: string): Promise<void> {
  console.log(`\n📝 Creating database: ${database}`);
  
  const baseConn = getBaseConnectionString();
  const command = `psql "${baseConn}" -c "CREATE DATABASE ${database};"`;
  
  try {
    await execAsync(command);
    console.log(`✓ Database created: ${database}`);
  } catch (error: any) {
    throw new Error(`Failed to create database: ${error.stderr || error.message}`);
  }
}

/**
 * Restores the database from a backup file
 */
async function performRestore(filePath: string, database: string, verbose: boolean = false): Promise<number> {
  console.log(`\n🔄 Restoring database: ${database}`);
  console.log(`📄 From: ${filePath}`);
  
  const fileSizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
  console.log(`📊 File size: ${fileSizeMB} MB`);
  
  const startTime = Date.now();
  
  const baseConn = getBaseConnectionString();
  const fullPath = path.resolve(filePath);
  
  // Build psql command
  let command = `psql "${baseConn}/${database}" -f "${fullPath}"`;
  
  if (!verbose) {
    command += ' -q'; // Quiet mode
  }
  
  console.log('\nExecuting restore...');
  console.log('─'.repeat(60));
  
  try {
    await execAsync(command);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('─'.repeat(60));
    console.log(`✓ Restore completed successfully in ${duration}s`);
    
    return parseFloat(duration);
  } catch (error: any) {
    console.log('─'.repeat(60));
    throw new Error(`Restore failed: ${error.stderr || error.message}`);
  }
}

/**
 * Verifies the restored database by checking row counts
 */
async function verifyRestore(database: string): Promise<Record<string, number>> {
  console.log('\n🔍 Verifying restored data...');
  
  const baseConn = getBaseConnectionString();
  const tables = [
    'users',
    'campuses', 
    'blocks',
    'units',
    'companies',
    'leases',
    'sectors',
    'audit_logs'
  ];
  
  const counts: Record<string, number> = {};
  
  for (const table of tables) {
    try {
      const command = `psql "${baseConn}/${database}" -t -c "SELECT COUNT(*) FROM ${table} WHERE deleted_at IS NULL;"`;
      const { stdout } = await execAsync(command);
      const count = parseInt(stdout.trim()) || 0;
      counts[table] = count;
      console.log(`  ✓ ${table}: ${count} records`);
    } catch (err) {
      // Table might not exist, skip
      counts[table] = 0;
    }
  }
  
  return counts;
}

/**
 * Performs pre-restore safety checks
 */
async function performSafetyChecks(options: RestoreOptions, database: string): Promise<string[]> {
  const warnings: string[] = [];
  
  console.log('\n' + '='.repeat(60));
  console.log('⚠️  RESTORE SAFETY CHECK');
  console.log('='.repeat(60));
  
  // 1. Print environment info
  const environment = process.env.NODE_ENV || 'development';
  console.log(`Environment: ${environment}`);
  console.log(`DB Host: ${process.env.DB_HOST || 'localhost'}`);
  console.log(`DB Name: ${database}`);
  
  // 2. Check if production
  if (environment === 'production') {
    if (!options.allowProduction) {
      throw new Error(
        'RESTORE TO PRODUCTION DETECTED!\n' +
        'This operation will replace production data.\n' +
        'To proceed, add the --allow-production flag.'
      );
    }
    warnings.push('⚠️  PRODUCTION ENVIRONMENT: Data will be permanently replaced!');
  }
  
  // 3. Check if replica
  const isReplica = await checkIfReplica(database);
  if (isReplica) {
    throw new Error(
      'Target database is a READ REPLICA.\n' +
      'Cannot restore to replica. Target must be the primary database.'
    );
  }
  
  // 4. Check for DROP DATABASE flag
  if (options.dropExisting && !options.force) {
    throw new Error(
      'DROP DATABASE requires --force flag.\n' +
      'This will permanently delete all existing data.\n' +
      'Add --force to confirm.'
    );
  }
  
  // 5. Terminate active connections
  if (options.dropExisting) {
    await terminateConnections(database);
  }
  
  // 6. Interactive confirmation for dangerous operations
  if (!options.nonInteractive && options.dropExisting) {
    console.log('\n⚠️  WARNING: You are about to DROP the database!');
    console.log(`   Database: ${database}`);
    console.log(`   Input file: ${options.input}`);
    console.log(`   All existing data will be permanently LOST.`);
    
    const confirmed = await askConfirmation('Type "yes" to proceed: ');
    if (!confirmed) {
      throw new Error('Restore cancelled by user');
    }
  }
  
  return warnings;
}

/**
 * Asks user for confirmation
 */
async function askConfirmation(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Main restore function
 */
async function restoreDatabase(options: RestoreOptions): Promise<RestoreResult> {
  const lock = new BackupLock('restore');
  
  const startTime = Date.now();
  const targetDatabase = getTargetDatabase(options);
  const result: RestoreResult = {
    success: false,
    restoreTimeSeconds: 0,
    input: options.input,
    database: targetDatabase,
    fileExists: false,
    fileSizeBytes: 0,
    warnings: []
  };
  
  // Default to dry-run unless --execute is specified
  const isDryRun = !options.execute;
  
  console.log('='.repeat(60));
  console.log('DPT-Local Database Restore');
  console.log('='.repeat(60));
  console.log(`Input file: ${options.input}`);
  console.log(`Target database: ${targetDatabase}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE - No restore will be performed');
    console.log('   Add --execute flag to perform actual restore');
  }
  
  // Validate backup file
  console.log('\n🔍 Validating backup file...');
  const validation = validateBackupFile(options.input);
  
  result.fileExists = validation.exists;
  result.fileSizeBytes = validation.size;
  
  if (!validation.exists || validation.error) {
    console.error(`✗ Validation failed: ${validation.error}`);
    
    // Suggest available backups
    const available = listAvailableBackups();
    if (available.length > 0) {
      console.log('\n💡 Available backups:');
      available.forEach((f, i) => {
        const stats = fs.statSync(f);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`  ${i + 1}. ${f} (${sizeMB} MB)`);
      });
    }
    
    result.error = validation.error;
    return result;
  }
  
  const fileSizeMB = (validation.size / (1024 * 1024)).toFixed(2);
  console.log(`✓ Backup file valid: ${fileSizeMB} MB`);
  
  if (isDryRun) {
    console.log('\n✓ Dry run completed - file is valid for restore');
    result.success = true;
    return result;
  }
  
  // Acquire lock for restore
  if (!await lock.acquire()) {
    result.error = 'Cannot acquire restore lock. Another operation is in progress.';
    console.error('❌ ' + result.error);
    return result;
  }
  
  try {
    // Perform safety checks
    const warnings = await performSafetyChecks(options, targetDatabase);
    result.warnings = warnings;
    
    // Drop existing database if requested
    if (options.dropExisting) {
      await dropDatabase(targetDatabase);
    }
    
    // Create database if missing
    if (options.createIfMissing || options.dropExisting) {
      await createDatabase(targetDatabase);
    }
    
    // Perform restore
    const restoreDuration = await performRestore(options.input, targetDatabase, options.verbose);
    result.restoreTimeSeconds = restoreDuration;
    
    // Verify restore
    result.rowCounts = await verifyRestore(targetDatabase);
    
    result.success = true;
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ Restore completed successfully!');
    console.log('='.repeat(60));
    console.log(`Duration: ${restoreDuration}s`);
    console.log(`Database: ${targetDatabase}`);
    console.log(`Records restored: ${Object.values(result.rowCounts || {}).reduce((a, b) => a + b, 0)}`);
    console.log('='.repeat(60));
    
    return result;
    
  } catch (error: any) {
    result.error = error.message;
    console.error('\n✗ Restore failed!');
    console.error(error.message);
    return result;
  } finally {
    lock.release();
  }
}

/**
 * Parses command line arguments
 */
function parseArgs(args: string[]): RestoreOptions {
  const options: RestoreOptions = {
    input: '',
  };
  
  for (const arg of args) {
    if (arg.startsWith('--input=')) {
      options.input = arg.split('=')[1];
    } else if (arg.startsWith('--database=')) {
      options.database = arg.split('=')[1];
    } else if (arg === '--drop-existing') {
      options.dropExisting = true;
    } else if (arg === '--create-if-missing') {
      options.createIfMissing = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--allow-production') {
      options.allowProduction = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--non-interactive') {
      options.nonInteractive = true;
    } else if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
DPT-Local Database Restore Script (Hardened)

⚠️  SECURITY: By default, this script runs in DRY-RUN mode.
   Add --execute to perform actual restore.

Usage:
  npm run restore -- --input=backup.sql                    # Dry-run validation
  npm run restore -- --input=backup.sql --execute          # Actual restore
  npm run restore -- --input=backup.sql --drop-existing --force --execute  # Replace DB
  npm run restore -- --input=backup.sql --allow-production --execute  # Production restore

Safety Flags:
  --execute               Actually perform restore (default is dry-run)
  --allow-production      Allow restore to production environment
  --force                 Required with --drop-existing
  --non-interactive       Skip confirmation prompts

Options:
  --input=<file>          Path to backup SQL file (required)
  --database=<name>       Target database name (default: from env)
  --drop-existing         Drop database before restore (requires --force)
  --create-if-missing     Create database if it doesn't exist
  --verbose               Show psql output during restore
  --dry-run               Validate file only (default behavior)

Examples:
  # Validate backup file
  npm run restore -- --input=backups/latest.sql

  # Restore to test database
  npm run restore -- --input=backups/backup.sql --database=test_restore --execute

  # Replace existing database (dangerous!)
  npm run restore -- --input=backup.sql --drop-existing --force --execute

  # Production restore (requires --allow-production)
  npm run restore -- --input=backup.sql --allow-production --execute

Safety Checks:
  ✓ Replica detection (cannot restore to read replica)
  ✓ Production warning (requires --allow-production for NODE_ENV=production)
  ✓ Force flag required for DROP DATABASE
  ✓ Interactive confirmation for dangerous operations
  ✓ Lock mechanism prevents concurrent operations
      `);
      process.exit(0);
    }
  }
  
  // Validate required input
  if (!options.input) {
    console.error('Error: --input parameter is required');
    console.error('Use --help for usage information');
    process.exit(1);
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
    
    const result = await restoreDatabase(options);
    
    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    console.error('\nRestore script terminated with errors');
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { restoreDatabase, RestoreOptions, RestoreResult };
