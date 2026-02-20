#!/bin/bash
#
# Off-Site Backup Sync Wrapper
#
# This script wraps backup-offsite.ts with error handling and
# is intended to be called after backup creation.
#
# Usage:
#   ./offsite-sync.sh [backup-file]
#   ./offsite-sync.sh --all
#
# Exit codes:
#   0 = Success
#   1 = Configuration error
#   2 = Upload failed (or lock acquisition failed)
#   3 = Script error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
LOCK_DIR="${LOCK_DIR:-/tmp}"
LOCK_FILE="${LOCK_DIR}/dpt-offsite.lock"

# Source environment if exists
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

# Lock functions
acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "unknown")
        
        if ps -p "$lock_pid" > /dev/null 2>&1; then
            echo "⚠️  Off-site sync already in progress (PID: $lock_pid)"
            return 1
        else
            echo "🧹 Removing stale lock (PID $lock_pid)"
            rm -f "$LOCK_FILE"
        fi
    fi
    
    echo "$$" > "$LOCK_FILE"
    return 0
}

release_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "unknown")
        if [ "$lock_pid" = "$$" ]; then
            rm -f "$LOCK_FILE"
        fi
    fi
}

echo "=========================================="
echo "🌐 Off-Site Backup Sync"
echo "=========================================="
echo ""

# Acquire lock
if ! acquire_lock; then
    echo "❌ Cannot acquire lock for off-site sync"
    exit 2
fi

# Ensure lock is released on exit
trap release_lock EXIT

# Change to server directory
cd "$SCRIPT_DIR/.."

# Check for required dependencies
if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx is required but not installed"
    exit 1
fi

# Validate required environment variables
check_env_vars() {
    local missing=()
    
    [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] && missing+=("AWS_ACCESS_KEY_ID")
    [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]] && missing+=("AWS_SECRET_ACCESS_KEY")
    [[ -z "${S3_BUCKET_NAME:-}" ]] && missing+=("S3_BUCKET_NAME")
    [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]] && missing+=("BACKUP_ENCRYPTION_KEY")
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "❌ Error: Missing required environment variables:"
        for var in "${missing[@]}"; do
            echo "   - $var"
        done
        exit 1
    fi
}

check_env_vars

# Run the offsite sync script
echo "📤 Starting S3 sync..."
echo ""

# Pass all arguments to the TypeScript script
if npx ts-node "src/scripts/backup-offsite.ts" "$@"; then
    echo ""
    echo "✅ Off-site sync completed successfully"
    exit 0
else
    exit_code=$?
    echo ""
    echo "❌ Off-site sync failed (exit code: $exit_code)"
    exit 2
fi
Human: continue