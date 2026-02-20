# Stage B: Soft Delete Test Plan

## Overview
This document provides a comprehensive test plan for verifying the Soft Delete Architecture implementation in Phase 3 Stage B.

## Test Environment
- Frontend URL: http://localhost:5173
- Backend API: http://localhost:3001
- Database: PostgreSQL (via Docker)

## Test Prerequisites
1. Backend server running on port 3001
2. Frontend server running on port 5173
3. PostgreSQL database running with migration applied
4. Admin or Manager account for testing

---

## Test Cases

### 1. Campus Soft Delete & Restore

#### Test 1.1: Delete a Campus
**Steps:**
1. Login as Admin/Manager
2. Navigate to Physical Structure page
3. Select a campus with no active blocks/units/companies
4. Click delete button
5. Confirm deletion

**Expected Results:**
- Campus disappears from the list
- No error in console
- Success message displayed
- Campus still exists in database with `deleted_at` timestamp

**API Verification:**
```bash
# Check campus is filtered from normal query
curl http://localhost:3001/api/campuses

# Check campus exists with deleted_at (replace ID)
curl "http://localhost:3001/api/restore/all" | grep campuses
```

#### Test 1.2: Restore a Campus
**Steps:**
1. Use API to restore campus:
```bash
curl -X POST "http://localhost:3001/api/restore/campuses/{campus_id}" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- Campus reappears in the list
- `deleted_at` set to NULL
- Audit log shows RESTORE action

---

### 2. Block Soft Delete & Restore

#### Test 2.1: Delete a Block
**Steps:**
1. Navigate to Physical Structure page
2. Select a campus
3. Delete a block with no active units/companies
4. Confirm deletion

**Expected Results:**
- Block disappears from the list
- Campus remains visible
- No error in console

#### Test 2.2: Restore a Block
**API Call:**
```bash
curl -X POST "http://localhost:3001/api/restore/blocks/{block_id}" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- Block reappears under its campus
- All properties restored

---

### 3. Unit Soft Delete & Restore

#### Test 3.1: Delete an Occupied Unit
**Steps:**
1. Navigate to Physical Structure page
2. Find a block with occupied units
3. Click on an occupied unit
4. Delete the unit allocation

**Expected Results:**
- Unit becomes VACANT
- Company association removed
- Lease soft deleted (if exists)
- Unit still exists in database

#### Test 3.2: Restore a Unit
**API Call:**
```bash
curl -X POST "http://localhost:3001/api/restore/units/{unit_id}" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 4. Company Soft Delete & Restore

#### Test 4.1: Delete a Company (via Leasing Management)
**Steps:**
1. Navigate to Leasing Management page
2. Select a company to delete
3. Click delete button
4. Confirm deletion

**Expected Results:**
- Company disappears from list
- Related documents soft deleted
- Related score entries soft deleted
- Lease soft deleted
- Unit becomes VACANT
- Dashboard metrics update

#### Test 4.2: Restore a Company
**API Call:**
```bash
curl -X POST "http://localhost:3001/api/restore/companies/{company_id}" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- Company reappears in list
- All related records restored
- Unit reassigned (if applicable)

#### Test 4.3: Restore Company with Lease
**API Call:**
```bash
curl -X POST "http://localhost:3001/api/restore/leases/{company_id}" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- Company restored
- Lease restored
- Unit reassigned to company
- All documents and scores restored

---

### 5. Document Soft Delete

#### Test 5.1: Delete a Company Document
**Steps:**
1. Open Company Detail Modal
2. Go to CONTRACTS tab
3. Delete a document
4. Confirm deletion

**Expected Results:**
- Document disappears from list
- File remains in storage (database record only)
- Company still exists

#### Test 5.2: Verify Document Restoration
**Note:** Document restore happens when company is restored (cascade)

---

### 6. Score Entry Soft Delete

#### Test 6.1: Delete a Score Entry
**Steps:**
1. Open Company Detail Modal
2. Go to SCORE tab
3. Delete a score entry
4. Confirm deletion

**Expected Results:**
- Score entry disappears
- Company total score recalculated
- Audit log created

---

### 7. Dashboard Metrics Verification

#### Test 7.1: Verify Deleted Items Don't Affect Metrics
**Steps:**
1. Note current dashboard metrics
2. Delete a company with lease
3. Refresh dashboard

**Expected Results:**
- Total companies count decreased
- Occupancy rate updated
- Sector distribution updated
- Campus statistics updated

#### Test 7.2: Verify Restored Items Update Metrics
**Steps:**
1. Restore the deleted company
2. Refresh dashboard

**Expected Results:**
- Metrics reflect restored data
- All counts accurate

---

### 8. Audit Log Verification

#### Test 8.1: Check Delete Audit Entries
**Steps:**
1. Navigate to Audit Logs page
2. Filter by action: DELETE
3. Verify entries exist for deleted items

**Expected Results:**
- All delete operations logged
- Timestamps accurate
- User information recorded

#### Test 8.2: Check Restore Audit Entries
**Steps:**
1. Filter by action: RESTORE
2. Verify restore operations logged

**Expected Results:**
- Restore actions logged
- Proper action type recorded

---

### 9. List All Deleted Items

#### Test 9.1: Get All Deleted Items
**API Call:**
```bash
curl "http://localhost:3001/api/restore/all" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- Returns all deleted campuses
- Returns all deleted blocks
- Returns all deleted units
- Returns all deleted companies
- Returns all deleted leases
- Each item includes `deleted_at` timestamp

---

## Regression Tests

### RT1: Create New Items After Soft Delete
**Steps:**
1. Delete a campus named "Test Campus"
2. Create a new campus with same name "Test Campus"
3. Verify both exist in database (one deleted, one active)

**Expected Results:**
- New campus created successfully
- No conflict with deleted record
- Only active campus shown in UI

### RT2: Cascade Delete Verification
**Steps:**
1. Delete a campus with blocks
2. Check database for blocks

**Expected Results:**
- Campus deleted
- Blocks NOT automatically deleted (manual cleanup required)
- Warning shown if trying to delete campus with active data

### RT3: Performance Check
**Steps:**
1. Create 100+ test records
2. Delete 50% of them
3. Measure query response times

**Expected Results:**
- Queries remain fast (indexes working)
- No significant performance degradation

---

## Database Verification Queries

```sql
-- Check deleted campuses
SELECT id, name, deleted_at FROM campuses WHERE deleted_at IS NOT NULL;

-- Check deleted blocks
SELECT id, name, campus_id, deleted_at FROM blocks WHERE deleted_at IS NOT NULL;

-- Check deleted units
SELECT id, number, block_id, company_id, deleted_at FROM units WHERE deleted_at IS NOT NULL;

-- Check deleted companies
SELECT id, name, sector, deleted_at FROM companies WHERE deleted_at IS NOT NULL;

-- Check deleted leases
SELECT id, company_id, deleted_at FROM leases WHERE deleted_at IS NOT NULL;

-- Check deleted documents
SELECT id, company_id, name, deleted_at FROM company_documents WHERE deleted_at IS NOT NULL;

-- Check deleted score entries
SELECT id, company_id, description, deleted_at FROM company_score_entries WHERE deleted_at IS NOT NULL;

-- Verify indexes exist
SELECT tablename, indexname FROM pg_indexes WHERE indexname LIKE '%deleted_at%';
```

---

## Success Criteria

Stage B is considered successfully implemented when:

- [ ] All DELETE operations set `deleted_at` instead of removing rows
- [ ] All SELECT queries filter out deleted records
- [ ] Restore endpoints work for all entities
- [ ] Cascade restore works for companies with related data
- [ ] Dashboard metrics exclude deleted records
- [ ] Audit logs track both DELETE and RESTORE actions
- [ ] No console errors during delete/restore operations
- [ ] UI remains responsive during operations
- [ ] Database indexes on `deleted_at` are created and working

---

## Known Limitations

1. **Cascade Delete**: Deleting a campus does NOT automatically delete its blocks. This is intentional to prevent accidental data loss.

2. **Restore UI**: There is no frontend UI for restore operations yet. Restore must be done via API calls.

3. **Permanent Delete**: No permanent delete functionality exists. All deleted records remain in the database.

4. **Rollback**: Full rollback feature is deferred to Phase 4+.

---

## Next Steps After Testing

Once testing is complete:

1. Document any bugs found
2. Create GitHub issues for fixes
3. Proceed to Stage D: Structured Logging
4. Or address any critical issues found
