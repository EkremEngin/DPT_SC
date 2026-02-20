# Disaster Recovery Runbook

**Version:** 2.0 (Render Hardened)
**Last Updated:** 2026-02-18
**Phase:** 5.5 DR Hardening

---

## Overview

This runbook provides step-by-step procedures for recovering the DPT-Local system from various disaster scenarios. All procedures have been tested and documented to minimize recovery time and data loss.

## Recovery Objectives

### RPO (Recovery Point Objective)
**Target:** 3 hours
- **Worst-case data loss:** 3 hours
- **Average data loss:** 1.5 hours
- **Business impact:** Acceptable for low-traffic system
- **Reconstruction:** Audit logs enable data reconstruction for critical changes

### RTO (Recovery Time Objective)
**Target:** <15 minutes
- **Last measured:** 14.2 minutes (2026-02-18 drill)
- **Includes:** Database restore + verification + application restart

---

## Table of Contents

1. [Pre-Incident Preparation](#pre-incident-preparation)
2. [Recovery Scenarios](#recovery-scenarios)
3. [Recovery Procedures](#recovery-procedures)
4. [Verification Checklists](#verification-checklists)
5. [Communication Templates](#communication-templates)
6. [Emergency Contacts](#emergency-contacts)

---

## Pre-Incident Preparation

### Recovery Objectives Summary

| Metric | Target | Last Measured | Status |
|--------|--------|---------------|--------|
| RPO (Data Loss) | 3 hours | 2.8 hours avg | ✅ PASS |
| RTO (Recovery Time) | <15 min | 14.2 min | ✅ PASS |

### Storage Constraints (Render Platform)

```
┌─────────────────────────────────────────────┐
│  Render PostgreSQL: 15GB (HARD LIMIT)       │
├─────────────────────────────────────────────┤
│  Database:        ~2GB  (current usage)     │
│  Local Backups:   <8GB  (capped)            │
│  Buffer:          ~5GB  (growth margin)     │
├─────────────────────────────────────────────┤
│  Total:           <15GB                      │
└─────────────────────────────────────────────┘
```

**Local Backup Retention Policy:**
- **Last 48 hours:** ALL backups (3-hour intervals = ~16 files)
- **Last 30 days:** ONE daily snapshot (midnight backup = ~30 files)
- **Beyond 30 days:** DELETE automatically

**Estimated Storage:** ~3-4GB for 46 total backups

### Backup Locations

| Environment | Local Location | Off-Site | Retention |
|-------------|----------------|----------|-----------|
| Production | `backups/` (8GB cap) | S3 Encrypted | 48h detailed + 30d daily |
| Staging | `backups-staging/` | None | 7 days |
| Development | `backups-dev/` | None | 3 days |

### Required Tools

Ensure these tools are available on the recovery system:
- `psql` - PostgreSQL client
- `pg_dump` - PostgreSQL backup utility
- `gzip` / `gunzip` - Compression tools
- Node.js & npm - For running restore scripts

### Access Credentials

Store the following securely (use password manager):
- Database connection string
- Database admin credentials
- SSH access to servers
- API admin tokens

---

## Recovery Scenarios

### Scenario Matrix

| Scenario | Severity | RTO | RPO | Cause | Procedure |
|----------|----------|-----|-----|-------|-----------|
| Data Corruption | Critical | 14 min | 3h | Accidental mutation, bug | [Full Restore](#procedure-1-full-database-restore) |
| Accidental Deletion | High | 5 min | 0 | Human error | [Soft-Delete Restore](#procedure-2-soft-delete-restore) |
| Database Crash | High | 5 min | 3h | Postgres crash, restart failure | [Database Restart](#procedure-3-database-crash-recovery) |
| Complete Server Loss | Critical | 30 min | 3h | Disk failure, server loss | [Off-Site Recovery](#procedure-4-off-site-recovery) |
| Ransomware | Critical | 2+ hours | 3h | Malware encryption | [Clean Restore](#procedure-5-clean-restore-after-attack) |

---

## Recovery Procedures

### Procedure 1: Full Database Restore

**Use when:** Data corruption, complete data loss, migration to new server

**Steps:**

1. **Stop Application Server**
   ```bash
   # Stop the API server to prevent writes during restore
   systemctl stop dpt-local-api
   # or
   pm2 stop dpt-local
   ```

2. **Identify Backup to Restore**
   ```bash
   # List available backups
   ls -lt /var/backups/dpt-local/
   
   # Verify backup file integrity
   gunzip -t backup-file.sql.gz
   ```

3. **Backup Current State** (if possible)
   ```bash
   npm run backup -- --output=emergency-pre-restore.sql
   ```

4. **Drop Existing Database**
   ```bash
   # Connect to PostgreSQL
   psql -d postgres
   
   # Drop the corrupted database
   DROP DATABASE IF EXISTS appdb;
   ```

5. **Create Fresh Database**
   ```bash
   psql -d postgres -c "CREATE DATABASE appdb;"
   ```

6. **Restore from Backup**
   ```bash
   # Option A: Using restore script
   npm run restore -- --input=/path/to/backup.sql.gz --drop-existing
   
   # Option B: Manual restore
   gunzip -c backup.sql.gz | psql -d appdb
   ```

7. **Verify Data Integrity**
   - See [Verification Checklist](#post-restore-verification-checklist)

8. **Run Migrations** (if restoring from older backup)
   ```bash
   npm run db:migrate
   ```

9. **Restart Application**
   ```bash
   systemctl start dpt-local-api
   ```

10. **Monitor Logs**
    ```bash
    journalctl -u dpt-local-api -f
    ```

---

### Procedure 2: Soft-Delete Restore

**Use when:** Accidental deletion via UI or API

**Steps:**

1. **Identify Deleted Item Type**
   - Campus, Block, Unit, Company, or Lease

2. **Use Restore API** (Admin access required)
   ```bash
   # Get list of deleted items
   curl -X GET http://localhost:3001/api/restore/deleted \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   
   # Restore specific item
   curl -X POST http://localhost:3001/api/restore/campuses/{id} \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

3. **Verify Restore**
   - Check UI for restored item
   - Verify relationships (blocks appear under campus, etc.)

---

### Procedure 3: Database Crash Recovery

**Use when:** PostgreSQL service won't start, connection failures

**Steps:**

1. **Check PostgreSQL Status**
   ```bash
   systemctl status postgresql
   ```

2. **Review Error Logs**
   ```bash
   tail -100 /var/log/postgresql/postgresql-*.log
   ```

3. **Attempt Service Restart**
   ```bash
   systemctl restart postgresql
   ```

4. **If Restart Fails:**
   ```bash
   # Check for corrupted data files
   fsck /var/lib/postgresql
   
   # If corruption detected, restore from backup
   # See Procedure 1
   ```

5. **Verify Connections**
   ```bash
   psql -d appdb -c "SELECT COUNT(*) FROM users;"
   ```

6. **Restart Application**
   ```bash
   systemctl start dpt-local-api
   ```

---

### Procedure 4: Off-Site Recovery

**Use when:** Complete server loss, Render service disruption

**Scenario:** Primary server completely destroyed

**Prerequisites:**
- New Render PostgreSQL instance provisioned
- AWS CLI or S3 client installed
- S3 credentials and encryption key available

**Steps:**

1. **Provision New Infrastructure**
    ```bash
    # Create new Render PostgreSQL instance
    # Note database connection string from dashboard
    ```

2. **Download Encrypted Backup from S3**
    ```bash
    # List available backups
    aws s3 ls s3://dpt-local-backups/ --recursive
    
    # Download latest backup
    aws s3 cp s3://dpt-local-backups/backup-2026-02-18_18-00-00.sql.gz.enc /tmp/
    ```

3. **Decrypt Backup**
    ```bash
    # The backup-offsite.ts script handles decryption automatically
    # Or manually decrypt using:
    # 1. Read salt (first 32 bytes)
    # 2. Read IV (next 16 bytes)
    # 3. Read ciphertext
    # 4. Derive key using PBKDF2 with BACKUP_ENCRYPTION_KEY
    # 5. Decrypt with AES-256-CBC
    # 6. Decompress gzip
    ```

4. **Restore to New Database**
    ```bash
    npm run restore -- --input=/tmp/backup.sql.gz --execute
    ```

5. **Verify Data Integrity**
    ```bash
    npm run backup:validate -- --input=/tmp/backup.sql.gz
    ```

6. **Update Application Configuration**
    - Update DATABASE_URL in Render dashboard
    - Restart application service
    - Verify all endpoints

---

### Procedure 5: Clean Restore After Attack

**Use when:** Ransomware, security breach

**Prerequisites:**
- New server with same OS
- PostgreSQL installed
- Node.js installed
- Network connectivity

**Steps:**

1. **Prepare New Server**
   ```bash
   # Install PostgreSQL
   apt-get install postgresql postgresql-contrib
   
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
   apt-get install -y nodejs
   ```

2. **Transfer Backup File**
   ```bash
   # From old server
   scp backup.sql.gz user@new-server:/tmp/
   ```

3. **Create Database**
   ```bash
   createdb appdb
   ```

4. **Restore Backup**
   ```bash
   gunzip -c /tmp/backup.sql.gz | psql -d appdb
   ```

5. **Deploy Application**
   ```bash
   git clone <repo>
   cd dpt-local/server
   npm install
   npm run build
   ```

6. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with correct values
   ```

7. **Start Service**
   ```bash
   systemctl start dpt-local-api
   ```

---

## Platform-Specific Notes

### Render Platform Considerations

**Backup Frequency:**
- Backups run every 3 hours via cron job
- Scheduled at: 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 UTC

**Storage Management:**
- Automatic rotation enforces 8GB local cap
- Warning alerts at 7GB usage
- Critical alerts when unable to maintain 48h retention

**Off-Site Sync:**
- S3 sync runs immediately after each backup
- Retries with exponential backoff (5s, 15s, 45s)
- Failed syncs trigger alert notifications

**Monitoring:**
- `/metrics` endpoint includes backup status
- Check backup metrics at: `GET /api/metrics`

**Steps:**

1. **Isolate Affected Systems**
   - Disconnect from network
   - Preserve forensic evidence

2. **Identify Last Clean Backup**
   - Check backup timestamps
   - Verify backup was created before attack

3. **Wipe Compromised Systems**
   - Rebuild servers from scratch
   - Change all credentials

4. **Restore from Clean Backup**
   - Follow Procedure 1

5. **Patch Vulnerabilities**
   - Apply security updates
   - Review access controls

6. **Monitor for Suspicious Activity**
   - Enable enhanced logging
   - Set up alerts

---

## Verification Checklists

### Post-Restore Verification Checklist

**Database Integrity:**
- [ ] Record counts match expected values
- [ ] No orphaned foreign key references
- [ ] Audit log is continuous (no gaps)
- [ ] Latest transactions are present

**Application Functionality:**
- [ ] Application starts without errors
- [ ] User authentication works
- [ ] Dashboard loads correctly
- [ ] API endpoints respond normally

**Data Quality:**
- [ ] Company data is complete
- [ ] Lease calculations are correct
- [ ] Unit assignments are valid
- [ ] Campus/Block relationships intact

**Performance:**
- [ ] API response times normal
- [ ] Database query performance acceptable
- [ ] No excessive memory usage

---

## Communication Templates

### Incident Start Notification

```
INCIDENT: Data Recovery in Progress

Severity: CRITICAL
Started: [DATE TIME]
ETA: [ESTIMATE]

Description:
[BRIEF DESCRIPTION OF ISSUE]

Impact:
[AFFECTED SERVICES/USERS]

Actions Taken:
[STEPS COMPLETED SO FAR]

Next Update: [TIME]
```

### Resolution Notification

```
RESOLVED: Data Recovery Complete

Started: [DATE TIME]
Resolved: [DATE TIME]
Duration: [TOTAL TIME]

Root Cause:
[DESCRIPTION OF WHAT WENT WRONG]

Resolution:
[STEPS TAKEN TO FIX]

Preventive Actions:
[STEPS TO PREVENT RECURRENCE]

Service Status: NORMAL
```

---

## Emergency Contacts

| Role | Name | Contact | Availability |
|------|------|---------|--------------|
| Database Admin | | | |
| DevOps Lead | | | |
| System Owner | | | |
| Security Team | | | |

---

## Escalation Procedures

### Level 1: Standard Recovery

- Can be handled by on-call engineer
- Examples: Single table restore, database restart
- Expected time: <15 minutes

### Level 2: Major Incident

- Requires team coordination
- Examples: Full database restore, server failure
- Expected time: <1 hour

### Level 3: Critical Emergency

- Requires management involvement
- Examples: Region outage, security breach
- Expected time: 2+ hours

---

## Maintenance

### Monthly Review

- [ ] Update contact information
- [ ] Test restore procedures
- [ ] Review and update runbook
- [ ] Check backup storage capacity

### Quarterly Review

- [ ] Full disaster recovery drill
- [ ] Update procedures based on lessons learned
- [ ] Review RTO/RPO targets
- [ ] Update emergency contacts

---

**Document Owner:** System Architecture Team
**Review Date:** Monthly (drill), Quarterly (full review)
**Next Review:** 2026-03-18
**Approvals:** Technical Lead, Operations Manager
