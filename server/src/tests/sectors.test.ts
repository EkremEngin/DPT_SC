/**
 * Sectors Route Tests
 * Updated for Phase 2: Sector Management (Separate Table)
 */

import request from 'supertest';
import express from 'express';
import sectorsRouter from '../routes/sectors';
import { query } from '../db';
import { generateTokens } from '../services/authService';

const app = express();
app.use(express.json());

// Mock authentication for testing with ADMIN role
app.use('/api/sectors', (req, res, next) => {
    (req as any).user = { id: 'test-user-id', username: 'testuser', role: 'ADMIN' };
    next();
}, sectorsRouter);

describe('Sectors API', () => {
    let testSectorNames: string[] = [];

    afterAll(async () => {
        // Cleanup test data
        for (const name of testSectorNames) {
            // Hard delete for cleanup
            await query('DELETE FROM sectors WHERE name = $1', [name]);
        }
    });

    describe('POST /api/sectors', () => {
        it('should create a new sector', async () => {
            const sectorName = 'Test Sector ' + Date.now();

            const response = await request(app)
                .post('/api/sectors')
                .send({ sector: sectorName });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);

            testSectorNames.push(sectorName);

            // Verify in DB
            const result = await query('SELECT * FROM sectors WHERE name = $1', [sectorName]);
            expect(result.rows.length).toBe(1);
            expect(result.rows[0].name).toBe(sectorName);
        });

        it('should return error if sector already exists', async () => {
            const sectorName = 'Test Sector Duplicate ' + Date.now();
            testSectorNames.push(sectorName);

            // Create first
            await request(app)
                .post('/api/sectors')
                .send({ sector: sectorName });

            // Create duplicate
            const response = await request(app)
                .post('/api/sectors')
                .send({ sector: sectorName });

            expect(response.status).toBe(400);
        });

        it('should restore soft-deleted sector', async () => {
            const sectorName = 'Test Sector Restore ' + Date.now();
            testSectorNames.push(sectorName);

            // Create
            await request(app).post('/api/sectors').send({ sector: sectorName });

            // Soft delete manually via SQL to simulate existing soft deleted record if needed,
            // or use DELETE endpoint if tested separately. Let's use SQL for isolation.
            await query('UPDATE sectors SET deleted_at = NOW() WHERE name = $1', [sectorName]);

            // Try to create again -> Should restore
            const response = await request(app)
                .post('/api/sectors')
                .send({ sector: sectorName });

            expect(response.status).toBe(201);

            // Verify active in DB
            const result = await query('SELECT deleted_at FROM sectors WHERE name = $1', [sectorName]);
            expect(result.rows[0].deleted_at).toBeNull();
        });
    });

    describe('GET /api/sectors', () => {
        it('should return list of sectors', async () => {
            // Ensure at least one sector exists
            const sectorName = 'Test Sector List ' + Date.now();
            testSectorNames.push(sectorName);
            await request(app).post('/api/sectors').send({ sector: sectorName });

            const response = await request(app).get('/api/sectors');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body).toContain(sectorName);
        });
    });

    describe('DELETE /api/sectors/:name', () => {
        it('should soft delete a sector', async () => {
            const sectorName = 'Test Sector Delete ' + Date.now();
            testSectorNames.push(sectorName);

            // Create
            await request(app).post('/api/sectors').send({ sector: sectorName });

            // Delete
            const response = await request(app).delete(`/api/sectors/${encodeURIComponent(sectorName)}`);
            expect(response.status).toBe(204);

            // Verify soft deleted in DB
            const result = await query('SELECT deleted_at FROM sectors WHERE name = $1', [sectorName]);
            expect(result.rows[0].deleted_at).not.toBeNull();

            // Verify not in GET list
            const listResponse = await request(app).get('/api/sectors');
            expect(listResponse.body).not.toContain(sectorName);
        });

        it('should return 404 for non-existent sector', async () => {
            const response = await request(app).delete('/api/sectors/NonExistentSector12345');
            expect(response.status).toBe(404);
        });
    });
});
