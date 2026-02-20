#!/bin/bash
###############################################################################
# P5.5 Resilience & DR - Scheduled Backup Automation Script (Linux/Mac)
#
# Automates daily database backups with compression and retention management.
# Designed to run via cron for scheduled execution.
#
# Cron Example (Daily at 2 AM):
#   0 2 * * * /path/to/scheduled-backup.sh >> /var/log/dpt-backup.log 2>&1
#
# Features:
#   - Creates timestamped backups
#   - Compresses with gzip
#   - Implements retention policy (default 30 days)
#   - Logs all operations
#   - Validates backup success
#
# @phase Phase 5.5 Resilience & Disaster Recovery Drills
###############################################################################

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Configuration (can be overridden by environment variables)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dpt-local}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_FILE="${LOG_FILE:-/var/log/dpt-local-backup.log}"
PROJECT_DIR="${PROJECT_DIR:-$(dirname "$(dirname "$(dirname "$0")")")}"
LOCK_DIR="${LOCK_DIR:-/tmp}"
LOCK_FILE="${LOCK_DIR}/dpt-backup.lock"

# Timestamp for this backup run
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="dpt-local-backup-${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

###############################################################################
# Logging Functions
###############################################################################

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2
}

log_separator() {
    log "============================================================"
}

###############################################################################
# Setup Functions
###############################################################################

setup_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR" || {
            log_error "Failed to create backup directory"
            exit 1
        }
    fi
}

check_dependencies() {
    local missing_deps=0
    
    for cmd in pg_dump gzip find; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required command not found: $cmd"
            missing_deps=1
        fi
    done
    
    if [ $missing_deps -eq 1 ]; then
        log_error "Missing required dependencies. Please install them."
        exit 1
    fi
}

###############################################################################
# Lock Functions
###############################################################################

acquire_lock() {
    # Check if lock file exists
    if [ -f "$LOCK_FILE" ]; then
        local lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "unknown")
        local lock_time=$(stat -c %Y "$LOCK_FILE" 2>/dev/null || stat -f %m "$LOCK_FILE" 2>/dev/null || echo "0")
        local current_time=$(date +%s)
        local lock_age=$((current_time - lock_time))
        
        # Check if process is still running
        if ps -p "$lock_pid" > /dev/null 2>&1; then
            log_error "Backup already in progress (PID: $lock_pid, lock age: ${lock_age}s)"
            return 1
        else
            log "Removing stale lock file (PID $lock_pid no longer active)"
            rm -f "$LOCK_FILE"
        fi
    fi
    
    # Create lock file with current PID
    echo "$$" > "$LOCK_FILE"
    log "Lock acquired (PID: $$)"
    return 0
}

release_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "unknown")
        if [ "$lock_pid" = "$$" ]; then
            rm -f "$LOCK_FILE"
            log "Lock released"
        else
            log "Warning: Attempted to release lock owned by PID $lock_pid"
        fi
    fi
}

###############################################################################
# Backup Functions
###############################################################################

create_backup() {
    local output_path="$BACKUP_DIR/$BACKUP_FILE"
    
    log "Starting backup creation..."
    log "Output file: $output_path"
    
    # Navigate to project directory
    cd "$PROJECT_DIR" || {
        log_error "Failed to change to project directory: $PROJECT_DIR"
        exit 1
    }
    
    # Run backup script via npm
    if [ -f "package.json" ]; then
        log "Using npm run backup..."
        npm run backup -- --output="$output_path" >> "$LOG_FILE" 2>&1 || {
            log_error "Backup creation failed"
            return 1
        }
    else
        log_error "package.json not found in $PROJECT_DIR"
        return 1
    fi
    
    # Verify backup file was created
    if [ ! -f "$output_path" ]; then
        log_error "Backup file was not created: $output_path"
        return 1
    fi
    
    local file_size=$(du -h "$output_path" | cut -f1)
    log "✓ Backup created successfully: $file_size"
    
    return 0
}

compress_backup() {
    local backup_path="$BACKUP_DIR/$BACKUP_FILE"
    local compressed_path="$BACKUP_DIR/$COMPRESSED_FILE"
    
    log "Compressing backup with gzip..."
    
    gzip "$backup_path" || {
        log_error "Compression failed"
        return 1
    }
    
    # Verify compressed file
    if [ ! -f "$compressed_path" ]; then
        log_error "Compressed file not found: $compressed_path"
        return 1
    fi
    
    local compressed_size=$(du -h "$compressed_path" | cut -f1)
    log "✓ Backup compressed: $compressed_size"
    
    # Create symlink to latest backup
    local latest_link="$BACKUP_DIR/latest.sql.gz"
    rm -f "$latest_link"
    ln -s "$compressed_path" "$latest_link" || {
        log "Warning: Failed to create latest symlink"
    }
    
    return 0
}

###############################################################################
# Retention Management
###############################################################################

cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    local old_backups=$(find "$BACKUP_DIR" -name "dpt-local-backup-*.sql.gz" -type f -mtime +$RETENTION_DAYS 2>/dev/null)
    
    if [ -z "$old_backups" ]; then
        log "No old backups to clean up"
        return 0
    fi
    
    local count=0
    while IFS= read -r backup_file; do
        log "Removing: $(basename "$backup_file")"
        rm -f "$backup_file"
        count=$((count + 1))
    done <<< "$old_backups"
    
    log "✓ Removed $count old backup(s)"
}

###############################################################################
# Reporting
###############################################################################

generate_backup_report() {
    local compressed_path="$BACKUP_DIR/$COMPRESSED_FILE"
    
    log_separator
    log "Backup Summary Report"
    log_separator
    log "Timestamp: $(date +'%Y-%m-%d %H:%M:%S')"
    log "Backup file: $COMPRESSED_FILE"
    
    if [ -f "$compressed_path" ]; then
        local file_size=$(du -h "$compressed_path" | cut -f1)
        log "File size: $file_size"
        log "Location: $compressed_path"
    fi
    
    local total_backups=$(find "$BACKUP_DIR" -name "dpt-local-backup-*.sql.gz" -type f 2>/dev/null | wc -l)
    local total_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
    
    log "Total backups: $total_backups"
    log "Total backup directory size: $total_size"
    log_separator
}

###############################################################################
# Main Execution
###############################################################################

main() {
    log_separator
    log "DPT-Local Scheduled Backup - Starting"
    log_separator
    
    # Acquire lock or exit
    if ! acquire_lock; then
        log_error "Failed to acquire backup lock"
        exit 2
    fi
    
    # Ensure lock is released on exit
    trap release_lock EXIT
    
    # Setup
    setup_backup_dir
    check_dependencies
    
    # Create backup
    if ! create_backup; then
        log_error "Backup creation failed"
        exit 1
    fi
    
    # Compress backup
    if ! compress_backup; then
        log_error "Backup compression failed"
        exit 1
    fi
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Generate report
    generate_backup_report
    
    log "✓ Scheduled backup completed successfully"
    log_separator
    
    exit 0
}

# Run main function
main "$@"
