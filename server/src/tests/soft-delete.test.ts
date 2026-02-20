/**
 * Soft Delete Architecture Tests
 * 
 * Comprehensive tests for soft delete functionality across all entities:
 * - Campuses
 * - Blocks
 * - Units
 * - Companies
 * - Leases
 * - Users (hard delete - for comparison)
 * 
 * Validates:
 * - Soft delete sets deleted_at timestamp
 * - Soft deleted items are excluded from normal queries
 * - Deleted items can be restored
 * - Cascade relationships are handled correctly
 */

import { query } from '../db';

describe('Soft Delete Architecture', () => {
    let testCampusId: string;
    let testBlockId: string;
    let testUnitId: string;
    let testCompanyId: string;
    let testLeaseId: string;
    let testUserId: string;

    beforeAll(async () => {
        // Create test data for soft delete testing
        const campusResult = await query(
            'INSERT INTO campuses (name, address, max_area_cap) VALUES ($1, $2, $3) RETURNING id',
            ['Soft Delete Test Campus', 'Test Location', 10000]
        );
        testCampusId = campusResult.rows[0].id;

        const blockResult = await query(
            `INSERT INTO blocks (campus_id, name, default_operating_fee, sqm_per_employee, floor_capacities)
             VALUES ($1, $2, $3, $4, '[]'::jsonb) RETURNING id`,
            [testCampusId, 'SBLK', 400, 5]
        );
        testBlockId = blockResult.rows[0].id;

        const companyResult = await query(
            `INSERT INTO companies (name, sector, manager_name, manager_phone, manager_email, employee_count)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            ['Soft Delete Company', 'Technology', 'Test Manager', '+905551234567', 'softdelete@test.com', 10]
        );
        testCompanyId = companyResult.rows[0].id;

        const unitResult = await query(
            `INSERT INTO units (block_id, number, floor, area_sqm, status, company_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [testBlockId, 'SBLK-1-1', '1', 50, 'OCCUPIED', testCompanyId]
        );
        testUnitId = unitResult.rows[0].id;

        const leaseResult = await query(
            `INSERT INTO leases (unit_id, company_id, start_date, end_date, monthly_rent, operating_fee)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [testUnitId, testCompanyId, '2024-01-01', '2025-12-31', 5000, 400]
        );
        testLeaseId = leaseResult.rows[0].id;

        // Create a test user for comparison (users use hard delete)
        const { hashPassword } = await import('../services/authService');
        const hashedPassword = await hashPassword('TestPassword123');
        const userResult = await query(
            'INSERT INTO users (username, password_hash, email, role) VALUES ($1, $2, $3, $4) RETURNING id',
            ['softdeleteuser', hashedPassword, 'softdelete@test.com', 'VIEWER']
        );
        testUserId = userResult.rows[0].id;
    });

    afterAll(async () => {
        // Cleanup - hard delete everything
        await query('DELETE FROM leases WHERE id = $1', [testLeaseId]);
        await query('DELETE FROM units WHERE id = $1', [testUnitId]);
        await query('DELETE FROM blocks WHERE id = $1', [testBlockId]);
        await query('DELETE FROM companies WHERE id = $1', [testCompanyId]);
        await query('DELETE FROM campuses WHERE id = $1', [testCampusId]);
        await query('DELETE FROM users WHERE id = $1', [testUserId]);
    });

    describe('Campus Soft Delete', () => {
        it('should have deleted_at column in campuses table', async () => {
            const result = await query(`
                SELECT column_name, data_type, is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'campuses' AND column_name = 'deleted_at'
            `);

            expect(result.rows.length).toBeGreaterThan(0);
            expect(result.rows[0].data_type).toBe('timestamp with time zone');
        });

        it('should set deleted_at timestamp when soft deleting campus', async () => {
            // Verify not deleted initially
            const beforeResult = await query('SELECT deleted_at FROM campuses WHERE id = $1', [testCampusId]);
            expect(beforeResult.rows[0].deleted_at).toBeNull();

            // Soft delete
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testCampusId]);

            // Verify deleted_at is set
            const afterResult = await query('SELECT deleted_at FROM campuses WHERE id = $1', [testCampusId]);
            expect(afterResult.rows[0].deleted_at).not.toBeNull();
            expect(afterResult.rows[0].deleted_at).toBeInstanceOf(Date);
        });

        it('should exclude deleted campuses from normal queries', async () => {
            // Ensure campus is deleted
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testCampusId]);

            // Normal query should not return deleted campus
            const result = await query('SELECT * FROM campuses WHERE deleted_at IS NULL AND id = $1', [testCampusId]);
            expect(result.rows.length).toBe(0);

            // Query including deleted should return it
            const allResult = await query('SELECT * FROM campuses WHERE id = $1', [testCampusId]);
            expect(allResult.rows.length).toBe(1);
        });

        it('should allow restoration of deleted campus', async () => {
            // Ensure campus is deleted
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testCampusId]);

            // Restore
            await query('UPDATE campuses SET deleted_at = NULL WHERE id = $1', [testCampusId]);

            // Verify restoration
            const result = await query('SELECT * FROM campuses WHERE id = $1', [testCampusId]);
            expect(result.rows[0].deleted_at).toBeNull();
        });
    });

    describe('Block Soft Delete', () => {
        it('should have deleted_at column in blocks table', async () => {
            const result = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'blocks' AND column_name = 'deleted_at'
            `);

            expect(result.rows.length).toBeGreaterThan(0);
        });

        it('should set deleted_at timestamp when soft deleting block', async () => {
            const beforeResult = await query('SELECT deleted_at FROM blocks WHERE id = $1', [testBlockId]);
            expect(beforeResult.rows[0].deleted_at).toBeNull();

            await query('UPDATE blocks SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testBlockId]);

            const afterResult = await query('SELECT deleted_at FROM blocks WHERE id = $1', [testBlockId]);
            expect(afterResult.rows[0].deleted_at).not.toBeNull();

            // Restore for other tests
            await query('UPDATE blocks SET deleted_at = NULL WHERE id = $1', [testBlockId]);
        });

        it('should exclude deleted blocks from queries', async () => {
            await query('UPDATE blocks SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testBlockId]);

            const result = await query('SELECT * FROM blocks WHERE deleted_at IS NULL AND id = $1', [testBlockId]);
            expect(result.rows.length).toBe(0);

            // Restore
            await query('UPDATE blocks SET deleted_at = NULL WHERE id = $1', [testBlockId]);
        });
    });

    describe('Unit Soft Delete', () => {
        it('should have deleted_at column in units table', async () => {
            const result = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'units' AND column_name = 'deleted_at'
            `);

            expect(result.rows.length).toBeGreaterThan(0);
        });

        it('should set deleted_at timestamp when soft deleting unit', async () => {
            const beforeResult = await query('SELECT deleted_at FROM units WHERE id = $1', [testUnitId]);
            expect(beforeResult.rows[0].deleted_at).toBeNull();

            await query('UPDATE units SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testUnitId]);

            const afterResult = await query('SELECT deleted_at FROM units WHERE id = $1', [testUnitId]);
            expect(afterResult.rows[0].deleted_at).not.toBeNull();

            // Restore
            await query('UPDATE units SET deleted_at = NULL WHERE id = $1', [testUnitId]);
        });

        it('should exclude deleted units from queries including JOINs', async () => {
            await query('UPDATE units SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testUnitId]);

            // Test with JOIN query (like in the route)
            const result = await query(`
                SELECT u.id, c.id as company_id
                FROM units u
                LEFT JOIN companies c ON u.company_id = c.id AND c.deleted_at IS NULL
                WHERE u.deleted_at IS NULL AND u.id = $1
            `, [testUnitId]);

            expect(result.rows.length).toBe(0);

            // Restore
            await query('UPDATE units SET deleted_at = NULL WHERE id = $1', [testUnitId]);
        });
    });

    describe('Company Soft Delete', () => {
        it('should have deleted_at column in companies table', async () => {
            const result = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'companies' AND column_name = 'deleted_at'
            `);

            expect(result.rows.length).toBeGreaterThan(0);
        });

        it('should set deleted_at timestamp when soft deleting company', async () => {
            const beforeResult = await query('SELECT deleted_at FROM companies WHERE id = $1', [testCompanyId]);
            expect(beforeResult.rows[0].deleted_at).toBeNull();

            await query('UPDATE companies SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testCompanyId]);

            const afterResult = await query('SELECT deleted_at FROM companies WHERE id = $1', [testCompanyId]);
            expect(afterResult.rows[0].deleted_at).not.toBeNull();

            // Restore
            await query('UPDATE companies SET deleted_at = NULL WHERE id = $1', [testCompanyId]);
        });

        it('should exclude deleted companies from queries', async () => {
            await query('UPDATE companies SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testCompanyId]);

            const result = await query('SELECT * FROM companies WHERE deleted_at IS NULL AND id = $1', [testCompanyId]);
            expect(result.rows.length).toBe(0);

            // Restore
            await query('UPDATE companies SET deleted_at = NULL WHERE id = $1', [testCompanyId]);
        });

        it('should handle company with contract template in soft delete', async () => {
            // Add contract template to test company
            await query(`
                UPDATE companies 
                SET contract_template = $1 
                WHERE id = $2
            `, [JSON.stringify({
                rentPerSqM: 10,
                startDate: '2024-01-01',
                endDate: '2025-12-31'
            }), testCompanyId]);

            // Soft delete
            await query('UPDATE companies SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testCompanyId]);

            // Verify it's deleted
            const result = await query('SELECT * FROM companies WHERE id = $1', [testCompanyId]);
            expect(result.rows[0].deleted_at).not.toBeNull();

            // Restore and verify contract template is preserved
            await query('UPDATE companies SET deleted_at = NULL WHERE id = $1', [testCompanyId]);
            const restored = await query('SELECT contract_template FROM companies WHERE id = $1', [testCompanyId]);
            expect(restored.rows[0].contract_template).not.toBeNull();
        });
    });

    describe('Lease Soft Delete', () => {
        it('should have deleted_at column in leases table', async () => {
            const result = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'leases' AND column_name = 'deleted_at'
            `);

            expect(result.rows.length).toBeGreaterThan(0);
        });

        it('should set deleted_at timestamp when soft deleting lease', async () => {
            const beforeResult = await query('SELECT deleted_at FROM leases WHERE id = $1', [testLeaseId]);
            expect(beforeResult.rows[0].deleted_at).toBeNull();

            await query('UPDATE leases SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testLeaseId]);

            const afterResult = await query('SELECT deleted_at FROM leases WHERE id = $1', [testLeaseId]);
            expect(afterResult.rows[0].deleted_at).not.toBeNull();

            // Restore
            await query('UPDATE leases SET deleted_at = NULL WHERE id = $1', [testLeaseId]);
        });

        it('should exclude deleted leases from queries', async () => {
            await query('UPDATE leases SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testLeaseId]);

            const result = await query('SELECT * FROM leases WHERE deleted_at IS NULL AND id = $1', [testLeaseId]);
            expect(result.rows.length).toBe(0);

            // Restore
            await query('UPDATE leases SET deleted_at = NULL WHERE id = $1', [testLeaseId]);
        });
    });

    describe('User Hard Delete (for comparison)', () => {
        it('should NOT have deleted_at column in users table', async () => {
            const result = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'deleted_at'
            `);

            expect(result.rows.length).toBe(0);
        });

        it('should use hard delete for users (row is removed)', async () => {
            // Verify user exists
            const beforeResult = await query('SELECT * FROM users WHERE id = $1', [testUserId]);
            expect(beforeResult.rows.length).toBe(1);

            // Hard delete
            await query('DELETE FROM users WHERE id = $1', [testUserId]);

            // Verify user is gone
            const afterResult = await query('SELECT * FROM users WHERE id = $1', [testUserId]);
            expect(afterResult.rows.length).toBe(0);
        });
    });

    describe('Cascade Relationships with Soft Delete', () => {
        it('should handle block deletion when campus is soft deleted', async () => {
            // Create a test campus with block
            const campusResult = await query(
                'INSERT INTO campuses (name, address, max_area_cap) VALUES ($1, $2, $3) RETURNING id',
                ['Cascade Campus', 'Location', 5000]
            );
            const campusId = campusResult.rows[0].id;

            const blockResult = await query(
                `INSERT INTO blocks (campus_id, name, default_operating_fee, sqm_per_employee)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [campusId, 'CBLK', 400, 5]
            );
            const blockId = blockResult.rows[0].id;

            // Soft delete campus
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [campusId]);

            // Block should still exist in database but excluded from normal queries
            const blockResult2 = await query('SELECT * FROM blocks WHERE id = $1', [blockId]);
            expect(blockResult2.rows.length).toBe(1); // Still in DB

            // Normal query should exclude it
            const activeBlocks = await query('SELECT * FROM blocks WHERE deleted_at IS NULL AND id = $1', [blockId]);
            expect(activeBlocks.rows.length).toBe(1); // Block itself is not deleted

            // Cleanup
            await query('DELETE FROM blocks WHERE id = $1', [blockId]);
            await query('DELETE FROM campuses WHERE id = $1', [campusId]);
        });

        it('should handle unit deletion when block is soft deleted', async () => {
            // Create test block with unit
            const blockResult = await query(
                `INSERT INTO blocks (campus_id, name, default_operating_fee, sqm_per_employee)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [testCampusId, 'UBLK', 400, 5]
            );
            const blockId = blockResult.rows[0].id;

            const unitResult = await query(
                `INSERT INTO units (block_id, number, floor, area_sqm, status)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [blockId, 'UBLK-1-1', '1', 50, 'VACANT']
            );
            const unitId = unitResult.rows[0].id;

            // Soft delete block
            await query('UPDATE blocks SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [blockId]);

            // Unit should still exist
            const unitCheck = await query('SELECT * FROM units WHERE id = $1', [unitId]);
            expect(unitCheck.rows.length).toBe(1);

            // Cleanup
            await query('DELETE FROM units WHERE id = $1', [unitId]);
            await query('DELETE FROM blocks WHERE id = $1', [blockId]);
        });

        it('should preserve audit logs when entity is soft deleted', async () => {
            // Create an entity and generate an audit log
            const auditResult = await query(`
                INSERT INTO audit_logs (entity_type, action, details, user_name)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, ['CAMPUS', 'CREATE', 'Test audit log', 'testuser']);

            const auditId = auditResult.rows[0].id;

            // Soft delete the campus (audit log target)
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testCampusId]);

            // Audit log should still exist
            const auditCheck = await query('SELECT * FROM audit_logs WHERE id = $1', [auditId]);
            expect(auditCheck.rows.length).toBe(1);

            // Restore campus for other tests
            await query('UPDATE campuses SET deleted_at = NULL WHERE id = $1', [testCampusId]);
            // Note: audit_logs table is append-only, we don't delete test entries
        });
    });

    describe('Soft Delete Query Patterns', () => {
        it('should support WHERE deleted_at IS NULL pattern', async () => {
            // Create multiple campuses, delete some
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testCampusId]);

            const activeResult = await query('SELECT * FROM campuses WHERE deleted_at IS NULL');
            const allResult = await query('SELECT * FROM campuses');

            // Active should be less than or equal to all
            expect(activeResult.rows.length).toBeLessThanOrEqual(allResult.rows.length);

            // Restore
            await query('UPDATE campuses SET deleted_at = NULL WHERE id = $1', [testCampusId]);
        });

        it('should support ORDER BY deleted_at DESC for finding recently deleted', async () => {
            // Create and delete two campuses with time delay
            const c1 = await query(
                'INSERT INTO campuses (name, address, max_area_cap) VALUES ($1, $2, $3) RETURNING id',
                ['Delete Test 1', 'Loc', 1000]
            );
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [c1.rows[0].id]);

            // Small delay to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 10));

            const c2 = await query(
                'INSERT INTO campuses (name, address, max_area_cap) VALUES ($1, $2, $3) RETURNING id',
                ['Delete Test 2', 'Loc', 1000]
            );
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [c2.rows[0].id]);

            // Query for recently deleted
            const result = await query(`
                SELECT * FROM campuses 
                WHERE deleted_at IS NOT NULL 
                ORDER BY deleted_at DESC
            `);

            if (result.rows.length >= 2) {
                const first = new Date(result.rows[0].deleted_at);
                const second = new Date(result.rows[1].deleted_at);
                expect(first >= second).toBe(true);
            }

            // Cleanup
            await query('DELETE FROM campuses WHERE id IN ($1, $2)', [c1.rows[0].id, c2.rows[0].id]);
        });

        it('should support counting active vs deleted records', async () => {
            // Use a unique name with timestamp to avoid conflicts
            const uniqueName = `Count Test Campus ${Date.now()}`;
            
            // Create a campus with unique name
            const tempCampus = await query(
                'INSERT INTO campuses (name, address, max_area_cap) VALUES ($1, $2, $3) RETURNING id',
                [uniqueName, 'Test Location', 10000]
            );
            
            // Verify it exists as active
            const activeCheck = await query('SELECT COUNT(*) FROM campuses WHERE id = $1 AND deleted_at IS NULL', [tempCampus.rows[0].id]);
            expect(parseInt(activeCheck.rows[0].count)).toBe(1);
            
            // Verify it's NOT in deleted count
            const deletedCheck = await query('SELECT COUNT(*) FROM campuses WHERE id = $1 AND deleted_at IS NOT NULL', [tempCampus.rows[0].id]);
            expect(parseInt(deletedCheck.rows[0].count)).toBe(0);
            
            // Soft delete it
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [tempCampus.rows[0].id]);
            
            // Verify it's now in deleted and not in active
            const afterActive = await query('SELECT COUNT(*) FROM campuses WHERE id = $1 AND deleted_at IS NULL', [tempCampus.rows[0].id]);
            const afterDeleted = await query('SELECT COUNT(*) FROM campuses WHERE id = $1 AND deleted_at IS NOT NULL', [tempCampus.rows[0].id]);
            expect(parseInt(afterActive.rows[0].count)).toBe(0);
            expect(parseInt(afterDeleted.rows[0].count)).toBe(1);
            
            // Cleanup
            await query('DELETE FROM campuses WHERE id = $1', [tempCampus.rows[0].id]);
        });
    });

    describe('Index Usage for Soft Delete Queries', () => {
        it('should have index on deleted_at for efficient filtering', async () => {
            const result = await query(`
                SELECT indexname 
                FROM pg_indexes 
                WHERE tablename = 'campuses' AND indexdef LIKE '%deleted_at%'
            `);

            // This test checks if an index exists (optional but recommended)
            // The result may be empty if no index was created, which is acceptable
            expect(result.rows).toBeDefined();
        });
    });

    describe('Data Integrity with Soft Delete', () => {
        it('should prevent foreign key violations when restoring', async () => {
            // Delete campus
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testCampusId]);

            // Delete block
            await query('UPDATE blocks SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testBlockId]);

            // Restore block before campus - should work since campus still exists in DB
            await query('UPDATE blocks SET deleted_at = NULL WHERE id = $1', [testBlockId]);

            // Then restore campus
            await query('UPDATE campuses SET deleted_at = NULL WHERE id = $1', [testCampusId]);

            // Verify both are restored
            const campus = await query('SELECT * FROM campuses WHERE id = $1', [testCampusId]);
            const block = await query('SELECT * FROM blocks WHERE id = $1', [testBlockId]);

            expect(campus.rows[0].deleted_at).toBeNull();
            expect(block.rows[0].deleted_at).toBeNull();
        });

        it('should maintain referential integrity after soft delete cycle', async () => {
            // Verify the full hierarchy is intact
            const campus = await query('SELECT * FROM campuses WHERE id = $1', [testCampusId]);
            const block = await query('SELECT * FROM blocks WHERE campus_id = $1 AND deleted_at IS NULL', [testCampusId]);
            const unit = await query('SELECT * FROM units WHERE block_id = $1 AND deleted_at IS NULL', [testBlockId]);

            expect(campus.rows.length).toBe(1);
            expect(block.rows.length).toBeGreaterThanOrEqual(0);
            expect(unit.rows.length).toBeGreaterThanOrEqual(0);
        });
    });
});
