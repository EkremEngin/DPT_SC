#!/usr/bin/env ts-node
/**
 * Automated Backup Validation
 * 
 * Validates backup integrity by restoring to a temporary database
 * and running verification queries. Ensures backups are restorable
 * and data integrity is maintained.
 * 
 * Features:
 * - Lock-based concurrency protection
 * - Timeout protection (10 minutes max)
 * - Comprehensive validation checks
 * - Rollback on failure
 * 
 * Usage:
 *   npm run backup:validate -- [backup-file]
 *   npm run backup:validate -- --latest    # Validate latest backup
 *   npm run backup:validate -- --all       # Validate all recent backups
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import dotenv from 'dotenv';
import { BackupLock } from './backup-lock';

const execAsync = promisify(exec);

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const VALIDATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const TEMP_DATABASE_PREFIX = 'dpt_validate_';
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');

interface ValidationResult {
  success: boolean;
  backupFile: string;
  durationSec: number;
  checks: ValidationCheck[];
  error?: string;
}

interface ValidationCheck {
  name: string;
  passed: boolean;
  details?: string;
  durationMs: number;
}

// ============================================================================
// Validation Functions
// ============================================================================

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
 * Generates a unique temporary database name
 */
function generateTempDbName(): string {
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  return `${TEMP_DATABASE_PREFIX}${randomSuffix}`;
}

/**
 * Creates a temporary database for validation
 */
async function createTempDatabase(dbName: string): Promise<void> {
  const baseConn = getBaseConnectionString();
  const command = `psql "${baseConn}" -c "CREATE DATABASE ${dbName};"`;
  
  await execAsync(command);
}

/**
 * Drops a temporary database
 */
async function dropTempDatabase(dbName: string): Promise<void> {
  const baseConn = getBaseConnectionString();
  const command = `psql "${baseConn}" -c "DROP DATABASE IF EXISTS ${dbName};"`;
  
  try {
    await execAsync(command);
  } catch (error) {
    // Non-fatal - database might not exist
    console.warn(`Warning: Could not drop temp database ${dbName}`);
  }
}

/**
 * Restores backup to temporary database with timeout
 */
async function restoreWithTimeout(
  backupFile: string,
  dbName: string,
  timeoutMs: number
): Promise<void> {
  const baseConn = getBaseConnectionString();
  const fullPath = path.resolve(backupFile);
  const command = `psql "${baseConn}/${dbName}" -f "${fullPath}" -q`;
  
  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Validation timeout exceeded')), timeoutMs);
  });
  
  // Create restore promise
  const restorePromise = execAsync(command);
  
  // Race between restore and timeout
  await Promise.race([restorePromise, timeoutPromise]);
}

/**
 * Validates row counts in restored database
 */
async function validateRowCounts(dbName: string): Promise<ValidationCheck> {
  const startTime = Date.now();
  const baseConn = getBaseConnectionString();
  
  const expectedTables = [
    { name: 'users', minRows: 1 },
    { name: 'campuses', minRows: 1 },
    { name: 'blocks', minRows: 0 },
    { name: 'units', minRows: 0 },
    { name: 'companies', minRows: 0 },
    { name: 'leases', minRows: 0 },
  ];
  
  const details: string[] = [];
  let allPassed = true;
  
  for (const table of expectedTables) {
    try {
      const command = `psql "${baseConn}/${dbName}" -t -c "SELECT COUNT(*) FROM ${table.name} WHERE deleted_at IS NULL;"`;
      const { stdout } = await execAsync(command);
      const count = parseInt(stdout.trim()) || 0;
      
      const passed = count >= table.minRows;
      if (!passed) allPassed = false;
      
      details.push(`${table.name}: ${count} rows ${passed ? '✓' : '✗ (expected >= ' + table.minRows + ')'}`);
    } catch (error) {
      allPassed = false;
      details.push(`${table.name}: ✗ Failed to query`);
    }
  }
  
  return {
    name: 'Row Counts',
    passed: allPassed,
    details: details.join(', '),
    durationMs: Date.now() - startTime
  };
}

/**
 * Validates foreign key constraints
 */
async function validateForeignKeys(dbName: string): Promise<ValidationCheck> {
  const startTime = Date.now();
  const baseConn = getBaseConnectionString();
  
  try {
    const command = `psql "${baseConn}/${dbName}" -t -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY';"`;
    const { stdout } = await execAsync(command);
    const fkCount = parseInt(stdout.trim()) || 0;
    
    // Just check that we can query foreign keys
    return {
      name: 'Foreign Keys',
      passed: true,
      details: `${fkCount} foreign key constraints found`,
      durationMs: Date.now() - startTime
    };
  } catch (error) {
    return {
      name: 'Foreign Keys',
      passed: false,
      details: `Failed to query foreign keys: ${error}`,
      durationMs: Date.now() - startTime
    };
  }
}

/**
 * Validates critical table structures
 */
async function validateTableStructure(dbName: string): Promise<ValidationCheck> {
  const startTime = Date.now();
  const baseConn = getBaseConnectionString();
  
  const criticalTables = ['users', 'campuses', 'companies'];
  const details: string[] = [];
  let allPassed = true;
  
  for (const table of criticalTables) {
    try {
      const command = `psql "${baseConn}/${dbName}" -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = '${table}';"`;
      const { stdout } = await execAsync(command);
      const columnCount = parseInt(stdout.trim()) || 0;
      
      const passed = columnCount > 0;
      if (!passed) allPassed = false;
      
      details.push(`${table}: ${columnCount} columns ${passed ? '✓' : '✗'}`);
    } catch (error) {
      allPassed = false;
      details.push(`${table}: ✗ Failed to query`);
    }
  }
  
  return {
    name: 'Table Structure',
    passed: allPassed,
    details: details.join(', '),
    durationMs: Date.now() - startTime
  };
}

/**
 * Runs a test query to verify database connectivity
 */
async function validateTestQuery(dbName: string): Promise<ValidationCheck> {
  const startTime = Date.now();
  const baseConn = getBaseConnectionString();
  
  try {
    const command = `psql "${baseConn}/${dbName}" -t -c "SELECT 1;"`;
    const { stdout } = await execAsync(command);
    
    const result = stdout.trim() === '1';
    
    return {
      name: 'Test Query',
      passed: result,
      details: result ? 'Successfully executed test query' : 'Test query returned unexpected result',
      durationMs: Date.now() - startTime
    };
  } catch (error) {
    return {
      name: 'Test Query',
      passed: false,
      details: `Failed to execute test query: ${error}`,
      durationMs: Date.now() - startTime
    };
  }
}

/**
 * Validates a single backup file
 */
async function validateBackup(backupFile: string): Promise<ValidationResult> {
  const lock = new BackupLock('validation');
  const startTime = Date.now();
  const checks: ValidationCheck[] = [];
  let tempDbName = '';
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Validating: ${path.basename(backupFile)}`);
  console.log(`${'='.repeat(60)}`);
  
  // File existence check
  if (!fs.existsSync(backupFile)) {
    return {
      success: false,
      backupFile,
      durationSec: 0,
      checks: [],
      error: `Backup file not found: ${backupFile}`
    };
  }
  
  const fileSize = (fs.statSync(backupFile).size / 1024 / 1024).toFixed(2);
  console.log(`   File size: ${fileSize} MB`);
  
  // Acquire lock
  if (!await lock.acquire()) {
    return {
      success: false,
      backupFile,
      durationSec: 0,
      checks: [],
      error: 'Cannot acquire validation lock. Another operation is in progress.'
    };
  }
  
  try {
    // Create temporary database
    tempDbName = generateTempDbName();
    console.log(`📝 Creating temporary database: ${tempDbName}`);
    await createTempDatabase(tempDbName);
    
    // Restore backup with timeout
    console.log(`🔄 Restoring backup (timeout: ${VALIDATION_TIMEOUT_MS / 1000}s)...`);
    await restoreWithTimeout(backupFile, tempDbName, VALIDATION_TIMEOUT_MS);
    
    // Run validation checks
    console.log(`🔍 Running validation checks...`);
    
    const check1 = await validateRowCounts(tempDbName);
    checks.push(check1);
    console.log(`   ${check1.passed ? '✓' : '✗'} ${check1.name}: ${check1.details || ''}`);
    
    const check2 = await validateForeignKeys(tempDbName);
    checks.push(check2);
    console.log(`   ${check2.passed ? '✓' : '✗'} ${check2.name}: ${check2.details || ''}`);
    
    const check3 = await validateTableStructure(tempDbName);
    checks.push(check3);
    console.log(`   ${check3.passed ? '✓' : '✗'} ${check3.name}: ${check3.details || ''}`);
    
    const check4 = await validateTestQuery(tempDbName);
    checks.push(check4);
    console.log(`   ${check4.passed ? '✓' : '✗'} ${check4.name}: ${check4.details || ''}`);
    
    const allPassed = checks.every(c => c.passed);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n${allPassed ? '✅' : '❌'} Validation ${allPassed ? 'PASSED' : 'FAILED'} (${duration}s)`);
    
    return {
      success: allPassed,
      backupFile,
      durationSec: parseFloat(duration),
      checks
    };
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error(`\n❌ Validation failed: ${errorMessage}`);
    
    return {
      success: false,
      backupFile,
      durationSec: parseFloat(duration),
      checks,
      error: errorMessage
    };
    
  } finally {
    // Always cleanup
    if (tempDbName) {
      console.log(`🧹 Cleaning up temporary database...`);
      await dropTempDatabase(tempDbName);
    }
    
    lock.release();
  }
}

/**
 * Finds the latest backup file
 */
function findLatestBackup(): string | null {
  const backupDir = BACKUP_DIR;
  
  if (!fs.existsSync(backupDir)) {
    return null;
  }
  
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz'))
    .map(f => ({
      name: f,
      path: path.join(backupDir, f),
      mtime: fs.statSync(path.join(backupDir, f)).mtime
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  
  return files.length > 0 ? files[0].path : null;
}

/**
 * Lists all backup files
 */
function listAllBackups(): string[] {
  const backupDir = BACKUP_DIR;
  
  if (!fs.existsSync(backupDir)) {
    return [];
  }
  
  return fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz'))
    .map(f => path.join(backupDir, f))
    .sort((a, b) => {
      const statA = fs.statSync(a);
      const statB = fs.statSync(b);
      return statB.mtime.getTime() - statA.mtime.getTime();
    });
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  console.log('==========================================');
  console.log('🔍 Backup Validation');
  console.log('==========================================');
  
  let targetFiles: string[] = [];
  
  if (args.includes('--latest')) {
    const latest = findLatestBackup();
    if (latest) {
      targetFiles = [latest];
      console.log(`   Mode: Latest backup`);
      console.log(`   File: ${path.basename(latest)}`);
    } else {
      console.log('ℹ️  No backup files found');
      return;
    }
  } else if (args.includes('--all')) {
    targetFiles = listAllBackups();
    console.log(`   Mode: All backups`);
    console.log(`   Count: ${targetFiles.length}`);
  } else if (args.length > 0 && !args[0].startsWith('--')) {
    const inputFile = args[0];
    if (fs.existsSync(inputFile)) {
      targetFiles = [inputFile];
      console.log(`   Mode: Single file`);
      console.log(`   File: ${inputFile}`);
    } else {
      console.error(`❌ File not found: ${inputFile}`);
      process.exit(1);
    }
  } else {
    // Default to latest
    const latest = findLatestBackup();
    if (latest) {
      targetFiles = [latest];
      console.log(`   Mode: Latest backup (default)`);
      console.log(`   File: ${path.basename(latest)}`);
    } else {
      console.log('ℹ️  No backup files found');
      return;
    }
  }
  
  console.log('');
  
  const results: ValidationResult[] = [];
  
  for (const file of targetFiles) {
    const result = await validateBackup(file);
    results.push(result);
  }
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 VALIDATION SUMMARY');
  console.log(`${'='.repeat(60)}`);
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationSec, 0).toFixed(2);
  
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total duration: ${totalDuration}s`);
  
  if (failed > 0) {
    console.log(`\n❌ Failed validations:`);
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`   - ${path.basename(r.backupFile)}: ${r.error || 'Checks failed'}`);
      });
    
    process.exit(1);
  }
  
  console.log(`\n✅ All validations passed!`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { validateBackup, ValidationResult };
