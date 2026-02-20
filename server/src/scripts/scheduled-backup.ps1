###############################################################################
# P5.5 Resilience & DR - Scheduled Backup Automation Script (Windows)
#
# PowerShell equivalent of scheduled-backup.sh for Windows environments.
# Automates daily database backups with compression and retention management.
#
# Task Scheduler Example (Daily at 2 AM):
#   schtasks /create /tn "DPT-Local Backup" /tr "powershell.exe -File C:\path\to\scheduled-backup.ps1" /sc daily /st 02:00
#
# Features:
#   - Creates timestamped backups
#   - Compresses with built-in compression
#   - Implements retention policy (default 30 days)
#   - Logs all operations
#   - Validates backup success
#
# @phase Phase 5.5 Resilience & Disaster Recovery Drills
###############################################################################

# Stop on errors
$ErrorActionPreference = "Stop"

# Configuration (can be overridden by environment variables)
$BACKUP_DIR = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "C:\backups\dpt-local" }
$RETENTION_DAYS = if ($env:RETENTION_DAYS) { [int]$env:RETENTION_DAYS } else { 30 }
$LOG_FILE = if ($env:LOG_FILE) { $env:LOG_FILE } else { "C:\logs\dpt-local-backup.log" }
$PROJECT_DIR = if ($env:PROJECT_DIR) { $env:PROJECT_DIR } else { Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) }

# Timestamp for this backup run
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BACKUP_FILE = "dpt-local-backup-$TIMESTAMP.sql"
$COMPRESSED_FILE = "$BACKUP_FILE.zip"

###############################################################################
# Logging Functions
###############################################################################

function Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] $Message"
    Write-Host $logEntry
    Add-Content -Path $LOG_FILE -Value $logEntry
}

function Log-Error {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] ERROR: $Message"
    Write-Host $logEntry -ForegroundColor Red
    Add-Content -Path $LOG_FILE -Value $logEntry
}

function Log-Separator {
    Log "============================================================"
}

###############################################################################
# Setup Functions
###############################################################################

function Setup-BackupDir {
    if (-not (Test-Path $BACKUP_DIR)) {
        Log "Creating backup directory: $BACKUP_DIR"
        try {
            New-Item -Path $BACKUP_DIR -ItemType Directory -Force | Out-Null
        }
        catch {
            Log-Error "Failed to create backup directory: $_"
            exit 1
        }
    }
    
    # Ensure log directory exists
    $logDir = Split-Path -Parent $LOG_FILE
    if (-not (Test-Path $logDir)) {
        New-Item -Path $logDir -ItemType Directory -Force | Out-Null
    }
}

function Check-Dependencies {
    $missingDeps = $false
    
    # Check if npm is available
    try {
        $null = Get-Command npm -ErrorAction Stop
    }
    catch {
        Log-Error "npm command not found. Please install Node.js."
        $missingDeps = $true
    }
    
    if ($missingDeps) {
        Log-Error "Missing required dependencies"
        exit 1
    }
}

###############################################################################
# Backup Functions
###############################################################################

function Create-Backup {
    $outputPath = Join-Path $BACKUP_DIR $BACKUP_FILE
    
    Log "Starting backup creation..."
    Log "Output file: $outputPath"
    
    # Navigate to project directory
    try {
        Set-Location $PROJECT_DIR
    }
    catch {
        Log-Error "Failed to change to project directory: $PROJECT_DIR"
        return $false
    }
    
    # Check if package.json exists
    if (-not (Test-Path "package.json")) {
        Log-Error "package.json not found in $PROJECT_DIR"
        return $false
    }
    
    # Run backup script via npm
    try {
        Log "Using npm run backup..."
        $process = Start-Process -FilePath "npm" -ArgumentList "run", "backup", "--", "--output=$outputPath" -Wait -NoNewWindow -PassThru -RedirectStandardOutput "$LOG_FILE.tmp" -RedirectStandardError "$LOG_FILE.err"
        
        # Append output to log
        Get-Content "$LOG_FILE.tmp" | Add-Content -Path $LOG_FILE
        Get-Content "$LOG_FILE.err" | Add-Content -Path $LOG_FILE
        
        if ($process.ExitCode -ne 0) {
            Log-Error "Backup creation failed with exit code: $($process.ExitCode)"
            return $false
        }
    }
    catch {
        Log-Error "Backup creation failed: $_"
        return $false
    }
    finally {
        Remove-Item "$LOG_FILE.tmp" -ErrorAction SilentlyContinue
        Remove-Item "$LOG_FILE.err" -ErrorAction SilentlyContinue
    }
    
    # Verify backup file was created
    if (-not (Test-Path $outputPath)) {
        Log-Error "Backup file was not created: $outputPath"
        return $false
    }
    
    $fileSize = (Get-Item $outputPath).Length / 1MB
    Log ("✓ Backup created successfully: {0:N2} MB" -f $fileSize)
    
    return $true
}

function Compress-Backup {
    $backupPath = Join-Path $BACKUP_DIR $BACKUP_FILE
    $compressedPath = Join-Path $BACKUP_DIR $COMPRESSED_FILE
    
    Log "Compressing backup..."
    
    try {
        Compress-Archive -Path $backupPath -DestinationPath $compressedPath -CompressionLevel Optimal -Force
        
        # Remove uncompressed file
        Remove-Item $backupPath
    }
    catch {
        Log-Error "Compression failed: $_"
        return $false
    }
    
    # Verify compressed file
    if (-not (Test-Path $compressedPath)) {
        Log-Error "Compressed file not found: $compressedPath"
        return $false
    }
    
    $compressedSize = (Get-Item $compressedPath).Length / 1MB
    Log ("✓ Backup compressed: {0:N2} MB" -f $compressedSize)
    
    return $true
}

###############################################################################
# Retention Management
###############################################################################

function Cleanup-OldBackups {
    Log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    $cutoffDate = (Get-Date).AddDays(-$RETENTION_DAYS)
    $oldBackups = Get-ChildItem -Path $BACKUP_DIR -Filter "dpt-local-backup-*.sql.zip" | Where-Object { $_.LastWriteTime -lt $cutoffDate }
    
    if ($oldBackups.Count -eq 0) {
        Log "No old backups to clean up"
        return
    }
    
    $count = 0
    foreach ($backup in $oldBackups) {
        Log "Removing: $($backup.Name)"
        Remove-Item $backup.FullName -Force
        $count++
    }
    
    Log "✓ Removed $count old backup(s)"
}

###############################################################################
# Reporting
###############################################################################

function Generate-BackupReport {
    $compressedPath = Join-Path $BACKUP_DIR $COMPRESSED_FILE
    
    Log-Separator
    Log "Backup Summary Report"
    Log-Separator
    Log "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Log "Backup file: $COMPRESSED_FILE"
    
    if (Test-Path $compressedPath) {
        $fileSize = (Get-Item $compressedPath).Length / 1MB
        Log ("File size: {0:N2} MB" -f $fileSize)
        Log "Location: $compressedPath"
    }
    
    $totalBackups = (Get-ChildItem -Path $BACKUP_DIR -Filter "dpt-local-backup-*.sql.zip").Count
    $totalSize = (Get-ChildItem -Path $BACKUP_DIR -Recurse | Measure-Object -Property Length -Sum).Sum / 1GB
    
    Log "Total backups: $totalBackups"
    Log ("Total backup directory size: {0:N2} GB" -f $totalSize)
    Log-Separator
}

###############################################################################
# Main Execution
###############################################################################

function Main {
    Log-Separator
    Log "DPT-Local Scheduled Backup - Starting"
    Log-Separator
    
    # Setup
    Setup-BackupDir
    Check-Dependencies
    
    # Create backup
    if (-not (Create-Backup)) {
        Log-Error "Backup creation failed"
        exit 1
    }
    
    # Compress backup
    if (-not (Compress-Backup)) {
        Log-Error "Backup compression failed"
        exit 1
    }
    
    # Cleanup old backups
    Cleanup-OldBackups
    
    # Generate report
    Generate-BackupReport
    
    Log "✓ Scheduled backup completed successfully"
    Log-Separator
    
    exit 0
}

# Run main function
try {
    Main
}
catch {
    Log-Error "Unexpected error: $_"
    exit 1
}
