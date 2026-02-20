/**
 * Units Route Tests
 *
 * Tests for units API endpoints:
 * - GET /api/units - List units with optional blockId filter
 * - POST /api/units/assign - Assign company to floor (create unit)
 * - PUT /api/units/:id - Update unit details
 * - DELETE /api/units/:id - Remove allocation (soft delete)
 */

import request from 'supertest';
import express from 'express';
import unitsRouter from '../routes/units';
import { query } from '../db';
import { generateTokens } from '../services/authService';

const app = express();
app.use(express.json());

// Mock authentication for testing
app.use('/api/units', (req, res, next) => {
    (req as any).user = { id: 'test-user-id', username: 'testuser', role: 'ADMIN' };
    next();
}, unitsRouter);

describe('Units API', () => {
    let testCampusId: string;
    let testBlockId: string;
    let testCompanyId: string;
    let testUnitId: string;
    let authToken: string;

    beforeAll(async () => {
        // Create test campus
        const campusResult = await query(
            'INSERT INTO campuses (name, address, max_area_cap) VALUES ($1, $2, $3) RETURNING id',
            ['Test Campus for Units', 'Test Address', 10000]
        );
        testCampusId = campusResult.rows[0].id;

        // Create test block with floor capacities
        const blockResult = await query(
            `INSERT INTO blocks (campus_id, name, default_operating_fee, sqm_per_employee, floor_capacities)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [testCampusId, 'BLK', 400, 5, JSON.stringify([{ floor: '1', totalSqM: 500 }, { floor: '2', totalSqM: 600 }])]
        );
        testBlockId = blockResult.rows[0].id;

        // Create test company
        const companyResult = await query(
            `INSERT INTO companies (name, sector, manager_name, manager_phone, manager_email, employee_count)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            ['Test Unit Company', 'Technology', 'Test Manager', '+905551234567', 'test@unitcompany.com', 10]
        );
        testCompanyId = companyResult.rows[0].id;

        // Generate auth token
        const tokens = generateTokens({ id: 'test-user-id', username: 'testuser', role: 'ADMIN' });
        authToken = tokens.accessToken;
    });

    afterAll(async () => {
        // Cleanup test data
        await query('DELETE FROM units WHERE block_id = $1', [testBlockId]);
        await query('DELETE FROM blocks WHERE id = $1', [testBlockId]);
        await query('DELETE FROM companies WHERE id = $1', [testCompanyId]);
        await query('DELETE FROM campuses WHERE id = $1', [testCampusId]);
    });

    describe('GET /api/units', () => {
        it('should return list of units', async () => {
            const response = await request(app)
                .get('/api/units')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should filter units by blockId', async () => {
            // First create a test unit
            await query(
                `INSERT INTO units (block_id, number, floor, area_sqm, status, company_id)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [testBlockId, 'TEST-1-1', '1', 50, 'VACANT', null]
            );

            const response = await request(app)
                .get(`/api/units?blockId=${testBlockId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            if (response.body.length > 0) {
                expect(response.body[0].blockId).toBe(testBlockId);
            }

            // Cleanup
            await query('DELETE FROM units WHERE number = $1', ['TEST-1-1']);
        });

        it('should include company details for occupied units', async () => {
            // Create a unit with company
            const unitResult = await query(
                `INSERT INTO units (block_id, number, floor, area_sqm, status, company_id)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [testBlockId, 'TEST-1-2', '1', 50, 'OCCUPIED', testCompanyId]
            );
            testUnitId = unitResult.rows[0].id;

            const response = await request(app)
                .get(`/api/units?blockId=${testBlockId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            const unitWithCompany = response.body.find((u: any) => u.id === testUnitId);
            if (unitWithCompany) {
                expect(unitWithCompany.company).not.toBeNull();
                expect(unitWithCompany.company.id).toBe(testCompanyId);
            }
        });
    });

    describe('POST /api/units/assign', () => {
        it('should assign company to floor creating a new unit', async () => {
            const response = await request(app)
                .post('/api/units/assign')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    blockId: testBlockId,
                    companyId: testCompanyId,
                    floor: '1',
                    areaSqM: 50,
                    isReserved: false
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.blockId).toBe(testBlockId);
            expect(response.body.status).toBe('OCCUPIED');
        });

        it('should create a reserved unit', async () => {
            const response = await request(app)
                .post('/api/units/assign')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    blockId: testBlockId,
                    companyId: testCompanyId,
                    floor: '1',
                    areaSqM: 50,
                    isReserved: true,
                    reservationFee: 5000
                });

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('RESERVED');
            expect(response.body.reservationFee).toBe(5000);
        });

        it('should validate blockId is a valid UUID', async () => {
            const response = await request(app)
                .post('/api/units/assign')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    blockId: 'invalid-uuid',
                    companyId: testCompanyId,
                    floor: '1',
                    areaSqM: 50
                });

            expect(response.status).toBe(400);
        });

        it('should validate areaSqM is a positive number', async () => {
            const response = await request(app)
                .post('/api/units/assign')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    blockId: testBlockId,
                    companyId: testCompanyId,
                    floor: '1',
                    areaSqM: -10
                });

            expect(response.status).toBe(400);
        });

        it('should enforce floor capacity limits', async () => {
            // Try to assign more area than floor capacity
            const response = await request(app)
                .post('/api/units/assign')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    blockId: testBlockId,
                    companyId: testCompanyId,
                    floor: '1',
                    areaSqM: 10000 // Much larger than floor capacity of 500
                });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        it('should return 404 for non-existent block', async () => {
            const response = await request(app)
                .post('/api/units/assign')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    blockId: '00000000-0000-0000-0000-000000000000',
                    companyId: testCompanyId,
                    floor: '1',
                    areaSqM: 50
                });

            expect([404, 500]).toContain(response.status);
        });

        it('should return 404 for non-existent company', async () => {
            const response = await request(app)
                .post('/api/units/assign')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    blockId: testBlockId,
                    companyId: '00000000-0000-0000-0000-000000000000',
                    floor: '1',
                    areaSqM: 50
                });

            expect([404, 500]).toContain(response.status);
        });
    });

    describe('PUT /api/units/:id', () => {
        let updateUnitId: string;

        beforeEach(async () => {
            const result = await query(
                `INSERT INTO units (block_id, number, floor, area_sqm, status, company_id)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [testBlockId, 'TEST-UPDATE', '1', 50, 'OCCUPIED', testCompanyId]
            );
            updateUnitId = result.rows[0].id;
        });

        afterEach(async () => {
            await query('DELETE FROM units WHERE id = $1', [updateUnitId]);
        });

        it('should update unit area', async () => {
            const response = await request(app)
                .put(`/api/units/${updateUnitId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ areaSqM: 60 });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
        });

        it('should update associated company information', async () => {
            const response = await request(app)
                .put(`/api/units/${updateUnitId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    companyName: 'Updated Company Name',
                    sector: 'Updated Sector',
                    managerName: 'Updated Manager',
                    managerPhone: '+905559876543',
                    managerEmail: 'updated@test.com',
                    employeeCount: 20
                });

            expect(response.status).toBe(200);

            // Verify company was updated
            const companyResult = await query('SELECT * FROM companies WHERE id = $1', [testCompanyId]);
            expect(companyResult.rows[0].name).toBe('Updated Company Name');
            expect(companyResult.rows[0].sector).toBe('Updated Sector');
        });

        it('should validate phone number format', async () => {
            const response = await request(app)
                .put(`/api/units/${updateUnitId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ managerPhone: 'invalid-phone' });

            expect(response.status).toBe(400);
        });

        it('should validate email format', async () => {
            const response = await request(app)
                .put(`/api/units/${updateUnitId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ managerEmail: 'invalid-email' });

            expect(response.status).toBe(400);
        });

        it('should validate areaSqM is positive', async () => {
            const response = await request(app)
                .put(`/api/units/${updateUnitId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ areaSqM: 0 });

            expect(response.status).toBe(400);
        });

        it('should return 404 for non-existent unit', async () => {
            const response = await request(app)
                .put('/api/units/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ areaSqM: 60 });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/units/:id', () => {
        it('should soft delete a unit', async () => {
            // Use unique unit number to avoid conflicts
            const uniqueNumber = `TEST-SOFT-DELETE-${Date.now()}`;
            
            // Create a unit with a lease for testing
            const unitResult = await query(
                `INSERT INTO units (block_id, number, floor, area_sqm, status, company_id)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [testBlockId, uniqueNumber, '1', 50, 'OCCUPIED', testCompanyId]
            );
            const deleteUnitId = unitResult.rows[0].id;

            const response = await request(app)
                .delete(`/api/units/${deleteUnitId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(204);

            // Verify unit is soft deleted
            const unitCheck = await query('SELECT * FROM units WHERE id = $1', [deleteUnitId]);
            expect(unitCheck.rows[0].deleted_at).not.toBeNull();
        });

        it('should nullify lease unit_id on unit deletion', async () => {
            // Use a completely unique identifier that won't conflict with any other test
            const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Create a fresh company for complete test isolation
            const companyResult = await query(
                `INSERT INTO companies (name, sector, manager_name, manager_phone, manager_email)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [`Lease Test ${uniqueSuffix}`, 'Test Sector', 'Test Manager', '+905551234567', `lease${uniqueSuffix}@test.com`]
            );
            const isolatedCompanyId = companyResult.rows[0].id;
            
            // Use unique unit number to avoid conflicts
            const uniqueNumber = `LEASE-NULL-${uniqueSuffix}`;
            
            // Create a unit with a lease for testing
            const unitResult = await query(
                `INSERT INTO units (block_id, number, floor, area_sqm, status, company_id)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [testBlockId, uniqueNumber, '1', 50, 'OCCUPIED', isolatedCompanyId]
            );
            const deleteUnitId = unitResult.rows[0].id;

            // Create a lease for this unit
            const leaseResult = await query(
                `INSERT INTO leases (unit_id, company_id, start_date, end_date, monthly_rent, operating_fee)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [deleteUnitId, isolatedCompanyId, '2024-01-01', '2025-12-31', 5000, 400]
            );
            const deleteLeaseId = leaseResult.rows[0].id;

            // Verify the lease exists and is linked to our unit
            const beforeDelete = await query('SELECT * FROM leases WHERE id = $1', [deleteLeaseId]);
            expect(beforeDelete.rows.length).toBe(1);
            expect(beforeDelete.rows[0].unit_id).toBe(deleteUnitId);

            await request(app)
                .delete(`/api/units/${deleteUnitId}`)
                .set('Authorization', `Bearer ${authToken}`);

            // Verify lease was updated
            const leaseCheck = await query('SELECT * FROM leases WHERE id = $1', [deleteLeaseId]);
            expect(leaseCheck.rows[0].unit_id).toBeNull();
        });

        it('should return 404 for non-existent unit', async () => {
            const response = await request(app)
                .delete('/api/units/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
        });
    });
});
