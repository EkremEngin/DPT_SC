#!/usr/bin/env ts-node
/**
 * Backup Rotation and Storage Control
 * 
 * Implements tiered retention policy to keep local backup storage within 8GB cap
 * while maintaining adequate recovery windows under Render's 15GB PostgreSQL limit.
 * 
 * Retention Policy:
 *   - Last 48 hours: ALL backups (3-hour intervals = ~16 files)
 *   - Last 30 days: ONE daily snapshot (midnight backup)
 *   - Beyond 30 days: DELETE
 * 
 * Storage Cap: 8GB (hard limit)
 * 
 * Usage:
 *   npm run backup:rotate          # Apply rotation policy
 *   npm run backup:rotate -- --dry-run   # Preview without changes
 *   npm run backup:rotate -- --stats     # Show current stats
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const STORAGE_CAP_MB = 8 * 1024; // 8GB
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');

const RETENTION_POLICY = {
  detailed: {
    hours: 48,        // Keep all backups from last 48 hours
    interval: 3       // Assuming 3-hour backup intervals
  },
  daily: {
    days: 30,         // Keep one daily snapshot for 30 days
    hour: 0           // Keep midnight (00:00) backups
  }
};

interface BackupFile {
  path: string;
  name: string;
  size: number;
  mtime: Date;
  ageHours: number;
  ageDays: number;
  hour: number;
  isDetailed: boolean;
  isDaily: boolean;
}

interface RotationResult {
  dryRun: boolean;
  beforeStats: StorageStats;
  afterStats: StorageStats;
  deletedFiles: string[];
  keptFiles: string[];
  warnings: string[];
}

interface StorageStats {
  totalSizeMB: number;
  backupCount: number;
  detailed48h: number;
  daily30d: number;
  oldestBackup: string;
  newestBackup: string;
}

// ============================================================================
// File System Operations
// ============================================================================

function getBackupFiles(): BackupFile[] {
  const backupDir = BACKUP_DIR;
  
  if (!fs.existsSync(backupDir)) {
    return [];
  }
  
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz') || f.endsWith('.sql.gz.enc'))
    .filter(f => !f.startsWith('.'))
    .map(f => {
      const filePath = path.join(backupDir, f);
      const stats = fs.statSync(filePath);
      const now = new Date();
      const mtime = stats.mtime;
      const ageMs = now.getTime() - mtime.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      const ageDays = ageHours / 24;
      
      // Extract hour from filename (format: backup-YYYY-MM-DD_HH-MM-SS.sql.gz)
      const hourMatch = f.match(/(\d{2})-(\d{2})-(\d{2})/);
      const hour = hourMatch ? parseInt(hourMatch[3], 10) : 0;
      
      return {
        path: filePath,
        name: f,
        size: stats.size,
        mtime,
        ageHours,
        ageDays,
        hour,
        isDetailed: ageHours <= RETENTION_POLICY.detailed.hours,
        isDaily: hour === RETENTION_POLICY.daily.hour && ageDays <= RETENTION_POLICY.daily.days
      };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Newest first
  
  return files;
}

function calculateTotalSize(files: BackupFile[]): number {
  return files.reduce((sum, f) => sum + f.size, 0);
}

function calculateStats(files: BackupFile[]): StorageStats {
  const totalSize = calculateTotalSize(files);
  const detailed48h = files.filter(f => f.isDetailed).length;
  const daily30d = files.filter(f => f.isDaily).length;
  
  return {
    totalSizeMB: Number((totalSize / 1024 / 1024).toFixed(2)),
    backupCount: files.length,
    detailed48h,
    daily30d,
    oldestBackup: files.length > 0 ? files[files.length - 1].name : 'N/A',
    newestBackup: files.length > 0 ? files[0].name : 'N/A'
  };
}

// ============================================================================
// Rotation Logic
// ============================================================================

function determineFilesToKeep(files: BackupFile[]): { keep: Set<string>, delete: string[], warnings: string[] } {
  const keep = new Set<string>();
  const toDelete: string[] = [];
  const warnings: string[] = [];
  
  // Always keep files from last 48 hours
  const detailedBackups = files.filter(f => f.isDetailed);
  detailedBackups.forEach(f => keep.add(f.path));
  
  // Keep midnight backups from last 30 days (beyond 48 hours)
  const dailyBackups = files.filter(f => !f.isDetailed && f.isDaily);
  dailyBackups.forEach(f => keep.add(f.path));
  
  // Everything else is eligible for deletion
  files.forEach(f => {
    if (!keep.has(f.path)) {
      toDelete.push(f.path);
    }
  });
  
  // Check storage cap
  const keptFiles = files.filter(f => keep.has(f.path));
  const currentSize = calculateTotalSize(keptFiles);
  
  if (currentSize > STORAGE_CAP_MB * 1024 * 1024) {
    warnings.push(
      `⚠️  Storage cap (${STORAGE_CAP_MB}MB) exceeded even after standard retention policy. ` +
      `Current: ${(currentSize / 1024 / 1024).toFixed(2)}MB. ` +
      `Pruning oldest daily backups...`
    );
    
    // Sort kept files by age (oldest first) and prune
    const sortedByAge = [...keptFiles].sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
    let prunedSize = currentSize;
    
    for (const file of sortedByAge) {
      // Don't delete from last 48 hours
      if (file.isDetailed) continue;
      
      keep.delete(file.path);
      toDelete.push(file.path);
      prunedSize -= file.size;
      
      if (prunedSize <= STORAGE_CAP_MB * 1024 * 1024) break;
    }
    
    const finalSize = calculateTotalSize(files.filter(f => keep.has(f.path)));
    if (finalSize > STORAGE_CAP_MB * 1024 * 1024) {
      warnings.push(
        `⚠️  Unable to get under ${STORAGE_CAP_MB}MB cap. ` +
        `Final size: ${(finalSize / 1024 / 1024).toFixed(2)}MB. ` +
        `Consider increasing storage cap or reducing retention period.`
      );
    }
  }
  
  return { keep, delete: toDelete, warnings };
}

function deleteFiles(filePaths: string[]): number {
  let deleted = 0;
  
  for (const filePath of filePaths) {
    try {
      fs.unlinkSync(filePath);
      deleted++;
      console.log(`   🗑️  Deleted: ${path.basename(filePath)}`);
    } catch (error) {
      console.error(`   ⚠️  Failed to delete ${filePath}:`, error);
    }
  }
  
  return deleted;
}

// ============================================================================
// Main Execution
// ============================================================================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function printStats(stats: StorageStats): void {
  console.log('📊 Storage Statistics:');
  console.log(`   Total backups: ${stats.backupCount}`);
  console.log(`   Total size: ${stats.totalSizeMB} MB / ${STORAGE_CAP_MB} MB`);
  console.log(`   Detailed (48h): ${stats.detailed48h} backups`);
  console.log(`   Daily (30d): ${stats.daily30d} backups`);
  console.log(`   Oldest: ${stats.oldestBackup}`);
  console.log(`   Newest: ${stats.newestBackup}`);
  
  const usagePercent = (stats.totalSizeMB / STORAGE_CAP_MB * 100).toFixed(1);
  const bar = '█'.repeat(Math.floor(Number(usagePercent) / 2)) + '░'.repeat(50 - Math.floor(Number(usagePercent) / 2));
  console.log(`   Usage: [${bar}] ${usagePercent}%`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const statsOnly = args.includes('--stats');
  const force = args.includes('--force');
  
  console.log('==========================================');
  console.log('🔄 Backup Rotation');
  console.log('==========================================');
  console.log(`   Storage Cap: ${STORAGE_CAP_MB} MB`);
  console.log(`   Retention: 48h detailed + 30d daily`);
  console.log(`   Backup Dir: ${BACKUP_DIR}`);
  console.log('');
  
  // Get current files
  const files = getBackupFiles();
  const beforeStats = calculateStats(files);
  
  if (files.length === 0) {
    console.log('ℹ️  No backup files found');
    return;
  }
  
  console.log('📂 Current State:');
  printStats(beforeStats);
  console.log('');
  
  if (statsOnly) {
    return;
  }
  
  // Determine what to keep/delete
  const { keep, delete: toDelete, warnings } = determineFilesToKeep(files);
  
  if (warnings.length > 0) {
    warnings.forEach(w => console.log(warnings));
    console.log('');
  }
  
  console.log('📋 Rotation Plan:');
  console.log(`   Files to keep: ${keep.size}`);
  console.log(`   Files to delete: ${toDelete.length}`);
  console.log('');
  
  if (dryRun) {
    console.log('🔍 DRY RUN - No files will be deleted');
    console.log('');
    console.log('Files that would be deleted:');
    toDelete.forEach(f => {
      const stats = files.find(file => file.path === f);
      if (stats) {
        console.log(`   - ${stats.name} (${formatSize(stats.size)}, ${stats.ageDays.toFixed(1)}d old)`);
      }
    });
    return;
  }
  
  // Safety check for large deletions
  if (toDelete.length > 10 && !force) {
    console.log('⚠️  WARNING: About to delete multiple backup files.');
    console.log(`   ${toDelete.length} files will be permanently removed.`);
    console.log('');
    console.log('To proceed, use: npm run backup:rotate -- --force');
    return;
  }
  
  // Perform deletion
  if (toDelete.length > 0) {
    console.log('🗑️  Deleting old backups...');
    const deleted = deleteFiles(toDelete);
    console.log(`✓ Deleted ${deleted} file(s)`);
    console.log('');
  } else {
    console.log('ℹ️  No files to delete');
    console.log('');
  }
  
  // Calculate final stats
  const remainingFiles = getBackupFiles();
  const afterStats = calculateStats(remainingFiles);
  
  console.log('📊 Final State:');
  printStats(afterStats);
  console.log('');
  
  if (afterStats.totalSizeMB > STORAGE_CAP_MB) {
    console.log('⚠️  WARNING: Storage cap exceeded!');
    console.log(`   Consider increasing cap or reducing retention period.`);
    process.exit(1);
  }
  
  console.log('✅ Rotation complete');
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { BackupFile, StorageStats, determineFilesToKeep, calculateStats };
