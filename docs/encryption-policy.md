# Encryption Policy – Backup Data Protection

**Phase:** 5.5 DR Hardening  
**Platform:** Render  
**Document Version:** 1.0  
**Last Updated:** 2026-02-18

---

## Purpose

This document defines the encryption standards, key management procedures, and security controls for protecting DPT-Local backup data at rest and in transit.

---

## Encryption Standard

### Algorithm Selection

| Property | Value |
|----------|-------|
| **Cipher** | AES-256-CBC |
| **Key Derivation** | PBKDF2 |
| **PBKDF2 Iterations** | 100,000 |
| **Salt Length** | 32 bytes (256 bits) |
| **IV Length** | 16 bytes (128 bits) |
| **Hash Function** | SHA-256 |
| **Key Length** | 256 bits |

### Why AES-256-CBC

1. **Industry Standard:** NIST-approved, widely audited, trusted for data at rest
2. **Node.js Native:** Available via `crypto` module (zero external dependencies)
3. **Performance:** Efficient for large file encryption (database dumps)
4. **Compatibility:** Supported by all major cloud providers and tools

### Why PBKDF2

1. **Key Stretching:** Makes brute-force attacks computationally expensive
2. **Salt Support:** Prevents rainbow table attacks
3. **Configurable Cost:** 100,000 iterations balances security and performance
4. **Node.js Native:** No external library needed

---

## Encryption Process

### Backup Encryption Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Read backup file (SQL dump, gzip compressed)                │
│  2. Generate random salt (32 bytes via crypto.randomBytes)      │
│  3. Generate random IV (16 bytes via crypto.randomBytes)        │
│  4. Derive key = PBKDF2(password, salt, 100000, 32, 'sha256')  │
│  5. Encrypt = AES-256-CBC(key, iv, plaintext)                   │
│  6. Write: [salt (32B)] + [iv (16B)] + [ciphertext]            │
│  7. Calculate SHA-256 checksum of encrypted file                │
│  8. Upload to S3 with checksum metadata                         │
└─────────────────────────────────────────────────────────────────┘
```

### Decryption Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Download encrypted file from S3                             │
│  2. Verify SHA-256 checksum matches metadata                    │
│  3. Read salt (first 32 bytes)                                  │
│  4. Read IV (next 16 bytes)                                     │
│  5. Derive key = PBKDF2(password, salt, 100000, 32, 'sha256')  │
│  6. Decrypt = AES-256-CBC-Decrypt(key, iv, ciphertext)          │
│  7. Decompress gzip                                             │
│  8. Restore SQL dump                                            │
└─────────────────────────────────────────────────────────────────┘
```

### File Format

```
┌────────┬──────┬─────────────────────────────────┐
│ Salt   │  IV  │  Encrypted Data                  │
│ 32B    │ 16B  │  Variable length                 │
└────────┴──────┴─────────────────────────────────┘
```

All encrypted files use the extension `.sql.gz.enc`.

---

## Key Management

### Encryption Key

**Storage:** Environment variable `BACKUP_ENCRYPTION_KEY`

**Requirements:**
- Minimum 32 characters
- Mixed uppercase, lowercase, numbers, symbols
- Must not appear in source code, configuration files, or logs
- Must be set in Render environment variables dashboard

**Generation Command:**
```bash
# Generate a secure encryption key
openssl rand -base64 48
```

### Key Storage Locations

| Environment | Storage | Access Control |
|-------------|---------|----------------|
| Production | Render env vars | Platform-managed |
| Staging | Render env vars | Platform-managed |
| Local Dev | `.env` file | gitignored |

### Key Rotation

**Rotation Schedule:** Quarterly (every 90 days)

**Rotation Procedure:**
1. Generate new encryption key
2. Update `BACKUP_ENCRYPTION_KEY` in Render dashboard
3. Create new backup with new key immediately
4. Verify new backup can be decrypted
5. Keep old key documented in secure vault for 90 days (to decrypt old backups)
6. Update `KEY_ROTATION_DATE` environment variable
7. Document rotation in audit log

**Post-Rotation Verification:**
```bash
# After key rotation, verify:
npm run backup:create     # Create backup with new key
npm run backup:validate   # Validate backup integrity
```

### Key Compromise Protocol

**If encryption key is suspected compromised:**

1. **IMMEDIATE (0-15 min):**
   - Generate new encryption key
   - Update Render environment variable
   - Create emergency backup with new key

2. **SHORT-TERM (15 min - 1 hour):**
   - Audit S3 access logs for unauthorized downloads
   - Revoke any leaked credentials
   - Re-encrypt recent backups with new key (last 48h)

3. **FOLLOW-UP (1 hour - 24 hours):**
   - Review how key was exposed
   - Update security procedures
   - Notify stakeholders if data exposure confirmed
   - Document incident in post-mortem

---

## S3 Security Configuration

### Bucket Security

| Setting | Value | Rationale |
|---------|-------|-----------|
| Bucket Versioning | **Enabled** | Protects against accidental deletion |
| Server-Side Encryption | SSE-S3 (AES-256) | Double encryption layer |
| Public Access | **Blocked** | No public access ever |
| Access Logging | **Enabled** | Audit trail |
| Lifecycle Policy | 90 days | Auto-delete old versions |

### Access Control

**IAM Policy (Minimum Privilege):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::dpt-local-backups",
        "arn:aws:s3:::dpt-local-backups/*"
      ]
    }
  ]
}
```

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `BACKUP_ENCRYPTION_KEY` | AES-256 passphrase | (generated via openssl) |
| `AWS_ACCESS_KEY_ID` | S3 access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key | (secret) |
| `S3_BUCKET_NAME` | Bucket name | `dpt-local-backups` |
| `S3_REGION` | AWS region | `us-east-1` |
| `S3_ENDPOINT` | Custom endpoint (optional) | `https://s3.amazonaws.com` |

---

## Integrity Verification

### Checksum Strategy

Every encrypted backup includes a SHA-256 checksum:

1. **At Creation:** Checksum computed after encryption, stored in S3 metadata
2. **At Download:** Checksum recomputed and compared to stored value
3. **At Restore:** Checksum verified before decryption begins

### Verification Failures

If checksum mismatch detected:
- **Abort** restore immediately
- Log error with both checksums
- Alert operations team
- Fall back to previous backup
- Investigate potential tampering

---

## Compliance Notes

### Data Classification

- Backup data contains: tenant info, company data, lease agreements, user credentials (hashed)
- Classification: **Confidential**
- Encryption: **Required** for all off-site storage

### Logging Requirements

All encryption operations must log (without exposing key material):
- Timestamp
- Operation type (encrypt/decrypt)
- File size (before/after)
- Checksum (SHA-256)
- Success/failure status
- Duration

### Prohibited Actions

- Never log encryption keys or passphrases
- Never store keys in source code or config files
- Never transmit keys via email or chat
- Never reuse the same salt/IV pair
- Never disable encryption for off-site backups

---

## Testing

### Encryption Validation Tests

```typescript
// Required test coverage:
1. Encrypt → Decrypt roundtrip produces identical data
2. Wrong key fails decryption gracefully
3. Corrupted ciphertext detected via checksum
4. Salt and IV are unique per encryption
5. File format matches specification (salt + iv + ciphertext)
```

### Monthly Validation

As part of the monthly DR drill:
1. Download random backup from S3
2. Verify checksum matches
3. Decrypt with current key
4. Restore to temporary database
5. Validate data integrity
6. Document results in drill log

---

**Document Owner:** System Architecture Team  
**Review Date:** 2026-05-18 (Quarterly Review)  
**Classification:** Internal
