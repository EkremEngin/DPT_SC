/**
 * Restore Route Tests
 * 
 * Tests for restore API endpoints (ADMIN only):
 * - POST /api/restore/campuses/:id - Restore soft-deleted campus
 * - POST /api/restore/blocks/:id - Restore soft-deleted block
 * - POST /api/restore/units/:id - Restore soft-deleted unit
 * - POST /api/restore/companies/:id - Restore soft-deleted company
 * - POST /api/restore/leases/:companyId - Restore soft-deleted lease
 * - GET /api/restore/deleted - List all deleted items
 */

import request from 'supertest';
import express from 'express';
import restoreRouter from '../routes/restore';
import { query } from '../db';
import { generateTokens } from '../services/authService';
import { AuthRequest } from '../middleware/authMiddleware';

const app = express();
app.use(express.json());

// Helper to mock authenticated admin user
function mockAdminAuth(req: any, res: any, next: any) {
    (req as any).user = { id: 'admin-user-id', username: 'adminuser', role: 'ADMIN' };
    next();
}

describe('Restore API', () => {
    let testCampusId: string;
    let testBlockId: string;
    let testUnitId: string;
    let testCompanyId: string;
    let testLeaseId: string;
    let adminToken: string;
    let deletedCampusId: string;
    let deletedBlockId: string;
    let deletedUnitId: string;
    let deletedCompanyId: string;
    let deletedLeaseId: string;

    beforeAll(async () => {
        // Generate admin token
        const tokens = generateTokens({ id: 'admin-user-id', username: 'adminuser', role: 'ADMIN' });
        adminToken = tokens.accessToken;

        // Create test campus
        const campusResult = await query(
            'INSERT INTO campuses (name, address, max_area_cap) VALUES ($1, $2, $3) RETURNING id',
            ['Test Restore Campus', 'Test Address', 10000]
        );
        testCampusId = campusResult.rows[0].id;

        // Create test block
        const blockResult = await query(
            `INSERT INTO blocks (campus_id, name, default_operating_fee, sqm_per_employee, floor_capacities)
             VALUES ($1, $2, $3, $4, '[]'::jsonb) RETURNING id`,
            [testCampusId, 'RBLK', 400, 5]
        );
        testBlockId = blockResult.rows[0].id;

        // Create test company
        const companyResult = await query(
            `INSERT INTO companies (name, sector, manager_name, manager_phone, manager_email, employee_count)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            ['Test Restore Company', 'Technology', 'Test Manager', '+905551234567', 'restore@test.com', 10]
        );
        testCompanyId = companyResult.rows[0].id;

        // Create test unit
        const unitResult = await query(
            `INSERT INTO units (block_id, number, floor, area_sqm, status, company_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [testBlockId, 'RBLK-1-1', '1', 50, 'OCCUPIED', testCompanyId]
        );
        testUnitId = unitResult.rows[0].id;

        // Create test lease
        const leaseResult = await query(
            `INSERT INTO leases (unit_id, company_id, start_date, end_date, monthly_rent, operating_fee)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [testUnitId, testCompanyId, '2024-01-01', '2025-12-31', 5000, 400]
        );
        testLeaseId = leaseResult.rows[0].id;

        // Create items to be deleted and then restored
        const delCampusResult = await query(
            'INSERT INTO campuses (name, address, max_area_cap) VALUES ($1, $2, $3) RETURNING id',
            ['Deleted Test Campus', 'Test Address', 5000]
        );
        deletedCampusId = delCampusResult.rows[0].id;

        const delBlockResult = await query(
            `INSERT INTO blocks (campus_id, name, default_operating_fee, sqm_per_employee, floor_capacities)
             VALUES ($1, $2, $3, $4, '[]'::jsonb) RETURNING id`,
            [testCampusId, 'DEL-BLK', 400, 5]
        );
        deletedBlockId = delBlockResult.rows[0].id;

        const delCompanyResult = await query(
            `INSERT INTO companies (name, sector, manager_name, manager_phone, manager_email)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            ['Deleted Company', 'Technology', 'Manager', '+905559998887', 'deleted@test.com']
        );
        deletedCompanyId = delCompanyResult.rows[0].id;

        const delUnitResult = await query(
            `INSERT INTO units (block_id, number, floor, area_sqm, status, company_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [testBlockId, 'DEL-1-1', '1', 50, 'VACANT', null]
        );
        deletedUnitId = delUnitResult.rows[0].id;

        // Soft delete these items
        await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [deletedCampusId]);
        await query('UPDATE blocks SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [deletedBlockId]);
        await query('UPDATE companies SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [deletedCompanyId]);
        await query('UPDATE units SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [deletedUnitId]);
        await query('UPDATE leases SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testLeaseId]);
        deletedLeaseId = testLeaseId;
    });

    afterAll(async () => {
        // Cleanup all test data
        await query('DELETE FROM leases WHERE company_id = $1 OR id = $2', [testCompanyId, deletedLeaseId]);
        await query('DELETE FROM units WHERE block_id = $1 OR id IN ($2, $3)', [testBlockId, deletedUnitId, testUnitId]);
        await query('DELETE FROM blocks WHERE campus_id = $1 OR id IN ($2, $3)', [testCampusId, deletedBlockId, testBlockId]);
        await query('DELETE FROM companies WHERE id IN ($1, $2, $3)', [testCompanyId, deletedCompanyId, '00000000-0000-0000-0000-000000000000']);
        await query('DELETE FROM campuses WHERE id IN ($1, $2)', [testCampusId, deletedCampusId]);
    });

    describe('GET /api/restore/deleted', () => {
        it('should return list of deleted items for ADMIN', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .get('/api/restore/deleted')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should include campuses, blocks, units, companies, and leases', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .get('/api/restore/deleted')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            
            // Check if we have the expected deleted items
            if (response.body.length > 0) {
                const types = new Set(response.body.map((item: any) => item.type));
                expect(types.size).toBeGreaterThan(0);
            }
        });

        it('should return items with deleted_at timestamp', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .get('/api/restore/deleted')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            if (response.body.length > 0) {
                expect(response.body[0]).toHaveProperty('deleted_at');
            }
        });
    });

    describe('POST /api/restore/campuses/:id', () => {
        it('should restore a soft-deleted campus', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post(`/api/restore/campuses/${deletedCampusId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', deletedCampusId);

            // Verify campus is restored
            const result = await query('SELECT * FROM campuses WHERE id = $1', [deletedCampusId]);
            expect(result.rows[0].deleted_at).toBeNull();

            // Re-delete for other tests
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [deletedCampusId]);
        });

        it('should return 404 for non-existent campus', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post('/api/restore/campuses/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });

        it('should return 400 for already active campus', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            // Try to restore an already active campus
            const response = await request(app)
                .post(`/api/restore/campuses/${testCampusId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
        });
    });

    describe('POST /api/restore/blocks/:id', () => {
        it('should restore a soft-deleted block', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post(`/api/restore/blocks/${deletedBlockId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', deletedBlockId);

            // Verify block is restored
            const result = await query('SELECT * FROM blocks WHERE id = $1', [deletedBlockId]);
            expect(result.rows[0].deleted_at).toBeNull();

            // Re-delete for other tests
            await query('UPDATE blocks SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [deletedBlockId]);
        });

        it('should return 404 for non-existent block', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post('/api/restore/blocks/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });

        it('should restore block and campus if campus is also deleted', async () => {
            // Create a block with a deleted campus
            const campusResult = await query(
                'INSERT INTO campuses (name, address, max_area_cap) VALUES ($1, $2, $3) RETURNING id',
                ['Temp Campus', 'Location', 5000]
            );
            const tempCampusId = campusResult.rows[0].id;

            const blockResult = await query(
                `INSERT INTO blocks (campus_id, name, default_operating_fee, sqm_per_employee)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [tempCampusId, 'TBLK', 400, 5]
            );
            const tempBlockId = blockResult.rows[0].id;

            // Delete both
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [tempCampusId]);
            await query('UPDATE blocks SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [tempBlockId]);

            // Restore block - should also restore campus
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post(`/api/restore/blocks/${tempBlockId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Check campus is also restored
            const campusCheck = await query('SELECT * FROM campuses WHERE id = $1', [tempCampusId]);
            expect(campusCheck.rows[0].deleted_at).toBeNull();

            // Cleanup
            await query('DELETE FROM blocks WHERE id = $1', [tempBlockId]);
            await query('DELETE FROM campuses WHERE id = $1', [tempCampusId]);
        });
    });

    describe('POST /api/restore/units/:id', () => {
        it('should restore a soft-deleted unit', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post(`/api/restore/units/${deletedUnitId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', deletedUnitId);

            // Verify unit is restored
            const result = await query('SELECT * FROM units WHERE id = $1', [deletedUnitId]);
            expect(result.rows[0].deleted_at).toBeNull();

            // Re-delete for other tests
            await query('UPDATE units SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [deletedUnitId]);
        });

        it('should restore unit, block, and campus if they are deleted', async () => {
            // Create nested structure: campus -> block -> unit
            const campusResult = await query(
                'INSERT INTO campuses (name, address, max_area_cap) VALUES ($1, $2, $3) RETURNING id',
                ['Nested Campus', 'Location', 5000]
            );
            const tempCampusId = campusResult.rows[0].id;

            const blockResult = await query(
                `INSERT INTO blocks (campus_id, name, default_operating_fee, sqm_per_employee)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [tempCampusId, 'NBLK', 400, 5]
            );
            const tempBlockId = blockResult.rows[0].id;

            const unitResult = await query(
                `INSERT INTO units (block_id, number, floor, area_sqm, status)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [tempBlockId, 'NBLK-1-1', '1', 50, 'VACANT']
            );
            const tempUnitId = unitResult.rows[0].id;

            // Delete all
            await query('UPDATE campuses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [tempCampusId]);
            await query('UPDATE blocks SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [tempBlockId]);
            await query('UPDATE units SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [tempUnitId]);

            // Restore unit - should restore all
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post(`/api/restore/units/${tempUnitId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Check all are restored
            const campusCheck = await query('SELECT * FROM campuses WHERE id = $1', [tempCampusId]);
            const blockCheck = await query('SELECT * FROM blocks WHERE id = $1', [tempBlockId]);
            const unitCheck = await query('SELECT * FROM units WHERE id = $1', [tempUnitId]);

            expect(campusCheck.rows[0].deleted_at).toBeNull();
            expect(blockCheck.rows[0].deleted_at).toBeNull();
            expect(unitCheck.rows[0].deleted_at).toBeNull();

            // Cleanup
            await query('DELETE FROM units WHERE id = $1', [tempUnitId]);
            await query('DELETE FROM blocks WHERE id = $1', [tempBlockId]);
            await query('DELETE FROM campuses WHERE id = $1', [tempCampusId]);
        });

        it('should return 404 for non-existent unit', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post('/api/restore/units/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/restore/companies/:id', () => {
        it('should restore a soft-deleted company', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post(`/api/restore/companies/${deletedCompanyId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', deletedCompanyId);

            // Verify company is restored
            const result = await query('SELECT * FROM companies WHERE id = $1', [deletedCompanyId]);
            expect(result.rows[0].deleted_at).toBeNull();

            // Re-delete for other tests
            await query('UPDATE companies SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [deletedCompanyId]);
        });

        it('should return 404 for non-existent company', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post('/api/restore/companies/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });

        it('should restore company and associated leases', async () => {
            // Create company with lease
            const companyResult = await query(
                `INSERT INTO companies (name, sector, manager_name, manager_phone, manager_email)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                ['Lease Company', 'Tech', 'Manager', '+905559998887', 'leasecomp@test.com']
            );
            const tempCompanyId = companyResult.rows[0].id;

            const leaseResult = await query(
                `INSERT INTO leases (company_id, start_date, end_date, monthly_rent, operating_fee)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [tempCompanyId, '2024-01-01', '2025-12-31', 5000, 400]
            );
            const tempLeaseId = leaseResult.rows[0].id;

            // Delete both
            await query('UPDATE companies SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [tempCompanyId]);
            await query('UPDATE leases SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [tempLeaseId]);

            // Restore company - should restore leases too
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post(`/api/restore/companies/${tempCompanyId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Check lease is also restored
            const leaseCheck = await query('SELECT * FROM leases WHERE id = $1', [tempLeaseId]);
            expect(leaseCheck.rows[0].deleted_at).toBeNull();

            // Cleanup
            await query('DELETE FROM leases WHERE id = $1', [tempLeaseId]);
            await query('DELETE FROM companies WHERE id = $1', [tempCompanyId]);
        });
    });

    describe('POST /api/restore/leases/:companyId', () => {
        it('should restore the most recent soft-deleted lease for a company', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            const response = await request(app)
                .post(`/api/restore/leases/${testCompanyId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id');
        });

        it('should return 404 when no deleted lease exists for company', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/restore', mockAdminAuth, restoreRouter);

            // Use a company that has no deleted leases
            const response = await request(app)
                .post('/api/restore/leases/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });
    });

    describe('Authorization', () => {
        it('should require ADMIN role for restore operations', async () => {
            const viewerToken = generateTokens({ id: 'viewer-id', username: 'viewer', role: 'VIEWER' }).accessToken;

            const app = express();
            app.use(express.json());
            app.use('/api/restore', (req: any, res: any, next: any) => {
                (req as any).user = { id: 'viewer-id', username: 'viewer', role: 'VIEWER' };
                next();
            }, restoreRouter);

            const response = await request(app)
                .post(`/api/restore/campuses/${deletedCampusId}`)
                .set('Authorization', `Bearer ${viewerToken}`);

            expect(response.status).toBe(403);
        });
    });
});
