#!/usr/bin/env ts-node
/**
 * DPT-Local Database Backup Script
 * 
 * This script creates a backup of the database using pg_dump.
 * It supports both full backups and selective table backups.
 * 
 * Usage:
 *   npm run backup                    # Full backup
 *   npm run backup -- --tables=...    # Selective tables
 *   npm run backup -- --output=...    # Custom output file
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { BackupLock, withLock } from './backup-lock';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

interface BackupOptions {
  output?: string;
  tables?: string;
  schemaOnly?: boolean;
  dataOnly?: boolean;
}

const DEFAULT_BACKUP_DIR = path.join(process.cwd(), 'backups');

/**
 * Ensures the backup directory exists
 */
function ensureBackupDir(): string {
  const backupDir = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

/**
 * Generates a timestamped backup filename
 */
function generateBackupFilename(extension = 'sql'): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `dpt-local-backup-${timestamp}_${time}.${extension}`;
}

/**
 * Constructs the pg_dump connection string
 */
function getConnectionString(): string {
  if (process.env.DATABASE_URL) {
    // Mask password in logs
    const url = process.env.DATABASE_URL;
    const masked = url.replace(/:([^:@]{4,})@/, ':****@');
    console.log(`Using DATABASE_URL: ${masked}`);
    return process.env.DATABASE_URL;
  }
  
  // Build connection string from individual env vars
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'appdb';
  const user = process.env.DB_USER || 'app';
  
  console.log(`Using connection: ${user}@${host}:${port}/${database}`);
  
  return `postgresql://${user}@${host}:${port}/${database}`;
}

/**
 * Executes pg_dump with appropriate options
 */
async function createBackup(options: BackupOptions = {}): Promise<string> {
  const backupDir = ensureBackupDir();
  const outputFile = options.output || path.join(backupDir, generateBackupFilename());
  
  console.log('='.repeat(60));
  console.log('DPT-Local Database Backup');
  console.log('='.repeat(60));
  console.log(`Output file: ${outputFile}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  const connectionString = getConnectionString();
  
  // Build pg_dump command
  const commandParts: string[] = [
    'pg_dump',
    `"${connectionString}"`,
    '--format=plain',         // Plain SQL format
    '--no-owner',             // Skip owner commands
    '--no-acl',               // Skip access control commands
    '--verbose',              // Verbose output
  ];
  
  // Add optional flags
  if (options.schemaOnly) {
    commandParts.push('--schema-only');
    console.log('Mode: Schema only (no data)');
  } else if (options.dataOnly) {
    commandParts.push('--data-only');
    console.log('Mode: Data only (no schema)');
  }
  
  if (options.tables) {
    const tables = options.tables.split(',').map(t => t.trim());
    tables.forEach(table => commandParts.push(`--table=${table}`));
    console.log(`Tables: ${tables.join(', ')}`);
  }
  
  // Add output redirection
  commandParts.push(`> "${outputFile}"`);
  
  const command = commandParts.join(' ');
  
  console.log('\nExecuting pg_dump...');
  console.log('-'.repeat(60));
  
  try {
    const startTime = Date.now();
    await execAsync(command);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Get file size
    const stats = fs.statSync(outputFile);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log('-'.repeat(60));
    console.log(`✓ Backup completed successfully in ${duration}s`);
    console.log(`✓ File size: ${fileSizeMB} MB`);
    console.log(`✓ Location: ${outputFile}`);
    console.log('='.repeat(60));
    
    return outputFile;
  } catch (error: any) {
    console.error('✗ Backup failed!');
    console.error(error.stderr || error.message);
    throw error;
  }
}

/**
 * Parses command line arguments
 */
function parseArgs(args: string[]): BackupOptions {
  const options: BackupOptions = {};
  
  for (const arg of args) {
    if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    } else if (arg.startsWith('--tables=')) {
      options.tables = arg.split('=')[1];
    } else if (arg === '--schema-only') {
      options.schemaOnly = true;
    } else if (arg === '--data-only') {
      options.dataOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
DPT-Local Database Backup Script

Usage:
  npm run backup                          # Full backup with timestamped filename
  npm run backup -- --output=file.sql     # Custom output file
  npm run backup -- --tables=t1,t2        # Backup specific tables
  npm run backup -- --schema-only         # Backup schema only
  npm run backup -- --data-only           # Backup data only

Examples:
  npm run backup
  npm run backup -- --output=backups/my-backup.sql
  npm run backup -- --tables=campuses,blocks,units
  npm run backup -- --schema-only --output=schema.sql
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
  const lock = new BackupLock('backup');
  
  try {
    // Attempt to acquire lock
    if (!await lock.acquire()) {
      console.error('\n❌ Cannot acquire backup lock. Another backup operation is already in progress.');
      console.error('   Use "npx ts-node src/scripts/backup-lock.ts status" to check lock status.');
      process.exit(2);
    }
    
    const args = process.argv.slice(2);
    const options = parseArgs(args);
    
    const outputFile = await createBackup(options);
    
    // Return success code
    process.exit(0);
  } catch (error) {
    console.error('\nBackup script terminated with errors');
    process.exit(1);
  } finally {
    // Always release lock
    lock.release();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { createBackup, BackupOptions };
