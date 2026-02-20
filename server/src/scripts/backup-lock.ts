/**
 * Backup Lock Mechanism
 * 
 * Prevents concurrent backup operations that could cause:
 * - Database contention
 * - Storage corruption
 * - Incomplete backups
 * - Resource exhaustion
 * 
 * Uses file-based locking with PID tracking and stale lock detection.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface LockInfo {
  pid: number;
  startTime: Date;
  operation: string;
}

export class BackupLock {
  private readonly lockFilePath: string;
  private acquired: boolean = false;

  constructor(operation: string = 'backup') {
    const lockDir = process.env.LOCK_DIR || '/tmp';
    this.lockFilePath = path.join(lockDir, `dpt-${operation}.lock`);
  }

  /**
   * Attempts to acquire the backup lock.
   * 
   * @returns true if lock acquired, false if already held by another process
   */
  async acquire(): Promise<boolean> {
    try {
      // Check if lock file exists
      if (fs.existsSync(this.lockFilePath)) {
        const lockContent = fs.readFileSync(this.lockFilePath, 'utf-8');
        const lockInfo = this.parseLockInfo(lockContent);
        
        // Check if the process is still running
        if (this.isProcessActive(lockInfo.pid)) {
          console.log(`⚠️  Backup already in progress (PID: ${lockInfo.pid}, started: ${lockInfo.startTime})`);
          console.log(`   Operation: ${lockInfo.operation}`);
          return false;
        }
        
        // Stale lock - remove it
        console.log(`🧹 Removing stale lock file (PID ${lockInfo.pid} no longer active)`);
        fs.unlinkSync(this.lockFilePath);
      }
      
      // Create lock file with current process info
      const lockInfo: LockInfo = {
        pid: process.pid,
        startTime: new Date(),
        operation: this.getOperationFromPath()
      };
      
      fs.writeFileSync(
        this.lockFilePath,
        JSON.stringify(lockInfo, null, 2),
        { mode: 0o644 }
      );
      
      this.acquired = true;
      console.log(`🔒 Lock acquired (PID: ${process.pid})`);
      
      return true;
    } catch (error) {
      console.error(`❌ Error acquiring lock:`, error);
      return false;
    }
  }

  /**
   * Releases the backup lock.
   */
  release(): void {
    if (!this.acquired) {
      return; // Nothing to release
    }
    
    try {
      if (fs.existsSync(this.lockFilePath)) {
        const lockContent = fs.readFileSync(this.lockFilePath, 'utf-8');
        const lockInfo = this.parseLockInfo(lockContent);
        
        // Only release if we own the lock
        if (lockInfo.pid === process.pid) {
          fs.unlinkSync(this.lockFilePath);
          console.log(`🔓 Lock released`);
        } else {
          console.warn(`⚠️  Attempted to release lock owned by PID ${lockInfo.pid}`);
        }
      }
      this.acquired = false;
    } catch (error) {
      console.error(`❌ Error releasing lock:`, error);
    }
  }

  /**
   * Gets information about the current lock holder.
   */
  getLockInfo(): LockInfo | null {
    try {
      if (!fs.existsSync(this.lockFilePath)) {
        return null;
      }
      
      const lockContent = fs.readFileSync(this.lockFilePath, 'utf-8');
      return this.parseLockInfo(lockContent);
    } catch {
      return null;
    }
  }

  /**
   * Checks if a process with the given PID is active.
   */
  private isProcessActive(pid: number): boolean {
    try {
      // On Unix-like systems, sending signal 0 checks if process exists
      process.kill(pid, 0);
      return true;
    } catch {
      // Process doesn't exist or we don't have permission
      return false;
    }
  }

  /**
   * Parses lock file content into LockInfo object.
   */
  private parseLockInfo(content: string): LockInfo {
    try {
      const parsed = JSON.parse(content);
      return {
        pid: parsed.pid || 0,
        startTime: new Date(parsed.startTime || Date.now()),
        operation: parsed.operation || 'unknown'
      };
    } catch {
      // Fallback for malformed lock files
      return {
        pid: parseInt(content, 10) || 0,
        startTime: new Date(),
        operation: 'unknown'
      };
    }
  }

  /**
   * Determines the operation name from the script path.
   */
  private getOperationFromPath(): string {
    const scriptPath = process.argv[1] || '';
    const scriptName = path.basename(scriptPath);
    
    if (scriptName.includes('backup')) return 'backup';
    if (scriptName.includes('restore')) return 'restore';
    if (scriptName.includes('validate')) return 'validation';
    if (scriptName.includes('offsite')) return 'offsite-sync';
    if (scriptName.includes('rotation')) return 'rotation';
    
    return 'unknown';
  }
}

/**
 * Executes a function with automatic lock management.
 * 
 * @param operation - Name of the operation for lock identification
 * @param fn - Async function to execute while holding the lock
 * @returns Result of the function
 * @throws Error if lock cannot be acquired
 */
export async function withLock<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const lock = new BackupLock(operation);
  
  if (!await lock.acquire()) {
    throw new Error(
      `Cannot acquire lock for ${operation}. ` +
      `Another ${operation} operation is already in progress.`
    );
  }
  
  try {
    return await fn();
  } finally {
    lock.release();
  }
}

/**
 * CLI helper for lock operations.
 */
export async function printLockStatus(): Promise<void> {
  const lock = new BackupLock();
  const lockInfo = lock.getLockInfo();
  
  if (!lockInfo) {
    console.log('✅ No backup lock is currently held');
    return;
  }
  
  const duration = Date.now() - new Date(lockInfo.startTime).getTime();
  const durationMin = (duration / 60000).toFixed(1);
  
  console.log('🔒 Backup lock information:');
  console.log(`   PID: ${lockInfo.pid}`);
  console.log(`   Operation: ${lockInfo.operation}`);
  console.log(`   Started: ${lockInfo.startTime.toISOString()}`);
  console.log(`   Duration: ${durationMin} minutes`);
  
  // Check if process is still active
  const active = (lock as any).isProcessActive(lockInfo.pid);
  console.log(`   Status: ${active ? 'Running' : 'Stale (process dead)'}`);
}

// If run directly
if (require.main === module) {
  const command = process.argv[2] || 'status';
  
  switch (command) {
    case 'status':
      printLockStatus().catch(console.error);
      break;
    case 'clear':
      const lock = new BackupLock();
      lock.release();
      console.log('✅ Lock cleared');
      break;
    default:
      console.log('Usage: npx ts-node backup-lock.ts [status|clear]');
  }
}
