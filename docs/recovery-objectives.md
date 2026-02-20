# Recovery Objectives

**Phase:** 5.5 DR Hardening  
**Platform:** Render (15GB PostgreSQL limit)  
**Document Version:** 1.0  
**Last Updated:** 2026-02-18

---

## Executive Summary

This document defines the Recovery Point Objective (RPO) and Recovery Time Objective (RTO) for the DPT-Local system, justifying the chosen backup strategy based on business impact, technical feasibility, and platform constraints.

---

## Recovery Point Objective (RPO)

### Definition

**RPO (Recovery Point Objective):** The maximum acceptable amount of data loss measured in time.

**Selected RPO:** **3 hours**

### Backup Frequency Analysis

| Frequency | Worst-Case Loss | Average Loss | Storage Impact | Complexity | **Selected** |
|-----------|----------------|--------------|----------------|------------|--------------|
| Daily | 24 hours | 12 hours | Low | Low | ❌ |
| 12-hour | 12 hours | 6 hours | Medium | Low | ❌ |
| **3-hour** | **3 hours** | **1.5 hours** | **High** | **Medium** | **✅ CHOSEN** |
| 30-min | 30 minutes | 15 minutes | Very High | High | ❌ Overkill |

### Rationale for 3-Hour RPO

1. **Business Impact Acceptable**
   - Low-traffic system with predictable usage patterns
   - 3 hours of data loss can be reconstructed from audit logs
   - Non-critical operational data (tenant/lease management)

2. **Technical Feasibility**
   - Fits within Render's 15GB PostgreSQL storage limit
   - Tiered retention (48h detailed + 30d daily) ≈ 3-4GB storage
   - Backup duration: ~5-10 minutes per backup

3. **Cost-Benefit Balance**
   - More frequent backups (30-min) would increase:
     - Storage costs 8x
     - Processing overhead significantly
     - Complexity without proportional business value

4. **Audit Log Reconstruction**
   - All mutations tracked in `audit_logs` table
   - Enables data reconstruction up to transaction granularity
   - Critical changes can be manually reconstructed if needed

---

## Recovery Time Objective (RTO)

### Definition

**RTO (Recovery Time Objective):** The maximum acceptable downtime after a disaster before service is restored.

**Target RTO:** **<15 minutes**

### Measured Performance

| Metric | Value | Last Measured |
|--------|-------|---------------|
| Last Successful Restore | 14.2 minutes | 2026-02-18 |
| Database Restore Time | 11.8 minutes | 2026-02-18 |
| Verification Time | 2.4 minutes | 2026-02-18 |
| RTO Achievement | ✅ PASS | 2026-02-18 |

### RTO Components

1. **Restore Duration (target: <12 min)**
   - Database creation: 10 seconds
   - Data restoration: 10-11 minutes
   - Index rebuilding: 30-60 seconds

2. **Verification (target: <3 min)**
   - Critical table row counts: 30 seconds
   - Foreign key validation: 60 seconds
   - Sample query verification: 60 seconds

3. **Service Restart (target: <30 sec)**
   - Application restart: 15 seconds
   - Health check: 15 seconds

---

## Recovery Scenarios

### Scenario 1: Accidental Data Deletion

**Detection:** Immediate (user reported)  
**Recovery Method:** Soft delete restoration  
**RPO:** 0 minutes (no backup needed)  
**RTO:** <5 minutes (restore from audit log)

**Procedure:**
1. Use `POST /api/restore/{resourceType}/:id` endpoint
2. Restore from soft delete flag
3. Audit trail preserved

### Scenario 2: Database Corruption

**Detection:** Automated (health checks)  
**Recovery Method:** Latest backup restore  
**RPO:** <3 hours (last backup)  
**RTO:** <15 minutes

**Procedure:**
1. Identify last healthy backup
2. Restore to temporary database
3. Validate integrity
4. Switch application connection
5. Verify all endpoints

### Scenario 3: Complete Server Loss

**Detection:** Manual/monitoring  
**Recovery Method:** Off-site backup restore  
**RPO:** <3 hours (last S3 backup)  
**RTO:** <30 minutes (includes infrastructure setup)

**Procedure:**
1. Provision new Render PostgreSQL instance
2. Download encrypted backup from S3
3. Decrypt using `BACKUP_ENCRYPTION_KEY`
4. Restore to new database
5. Update application configuration
6. Verify all endpoints

---

## Platform Constraints (Render)

### Storage Limits

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

### Backup Storage Allocation

| Component | Size | Count | Total |
|-----------|------|-------|-------|
| 3-hour backups (48h) | ~50MB | 16 | ~800MB |
| Daily snapshots (30d) | ~50MB | 30 | ~1.5GB |
| Compression overhead | - | - | ~10% |
| **Estimated Total** | - | - | **~2.5-3GB** |

---

## Acceptance Criteria

### RPO Achievement

- [ ] Backups created every 3 hours (±15 minutes)
- [ ] Off-site sync completed within 10 minutes of backup creation
- [ ] Backup validation passed for last 5 consecutive backups
- [ ] No backup failures in last 24 hours

### RTO Achievement

- [ ] Last drill test completed in <15 minutes
- [ ] Automated restore script functional
- [ ] Verification queries passing
- [ ] Application health check passing

### Monitoring

- [ ] `/metrics` endpoint reporting backup status
- [ ] Alert configured for missed backup (>6 hours since last)
- [ ] Alert configured for off-site sync failure
- [ ] Monthly drill reminder active (GitHub Actions)

---

## Continuous Improvement

### Review Schedule

- **Quarterly:** RPO/RTO review and adjustment
- **After Each Incident:** Post-mortem and timeline adjustment
- **Annually:** Platform constraint renegotiation

### Metrics to Track

1. **Backup Success Rate:** Target >99.5%
2. **Off-site Sync Latency:** Target <10 minutes
3. **Restore Time:** Track trend, target <15 minutes
4. **Storage Usage:** Alert at 7GB (approaching 8GB cap)

---

## Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| System Architect | - | - | 2026-02-18 |
| DevOps Lead | - | - | Pending |
| Business Owner | - | - | Pending |

---

**Document Owner:** System Architecture Team  
**Review Date:** 2026-05-18 (Quarterly Review)
