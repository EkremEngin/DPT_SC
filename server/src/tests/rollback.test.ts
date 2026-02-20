import dotenv from 'dotenv';
dotenv.config();

import request from 'supertest';
import express from 'express';
import campusesRouter from '../routes/campuses';
import rollbackRouter from '../routes/rollback';
import unitRouter from '../routes/units';
import { query } from '../db';

const app = express();
app.use(express.json());

// Mock auth
app.use((req, res, next) => {
    (req as any).user = { id: 'test-user-id', username: 'testuser', role: 'ADMIN' };
    next();
});

app.use('/api/campuses', campusesRouter);
app.use('/api/rollback', rollbackRouter);
app.use('/api/units', unitRouter);

describe('Rollback System', () => {
    let campusId: string;
    let blockId: string;
    let unitId: string;
    let companyId: string;
    let leaseId: string;

    afterEach(async () => {
        // Cleanup queries
        try {
            if (companyId) await query('DELETE FROM leases WHERE company_id = $1', [companyId]);
            if (blockId) await query('DELETE FROM units WHERE block_id = $1', [blockId]);
            if (campusId) await query('DELETE FROM blocks WHERE campus_id = $1', [campusId]);
            if (campusId) await query('DELETE FROM campuses WHERE id = $1', [campusId]);
            if (companyId) await query('DELETE FROM companies WHERE id = $1', [companyId]);

            await query("DELETE FROM audit_logs WHERE entity_type IN ('CAMPUS', 'UNIT') AND (details LIKE '%Test%' OR details LIKE '%U-1%')");
        } catch (e) {
            console.error('Cleanup failed', e);
        }
    });

    it('should rollback Campus Delete', async () => {
        // Setup
        const campusRes = await query('INSERT INTO campuses (name, deleted_at) VALUES ($1, NULL) RETURNING id', ['Test Campus']);
        campusId = campusRes.rows[0].id;

        const blockRes = await query('INSERT INTO blocks (campus_id, name, deleted_at) VALUES ($1, $2, NULL) RETURNING id', [campusId, 'Block A']);
        blockId = blockRes.rows[0].id;

        const companyRes = await query('INSERT INTO companies (name, deleted_at) VALUES ($1, NULL) RETURNING id', ['Test Company']);
        companyId = companyRes.rows[0].id;

        const unitRes = await query('INSERT INTO units (block_id, number, floor, area_sqm, status, company_id, deleted_at) VALUES ($1, $2, $3, $4, $5, $6, NULL) RETURNING id',
            [blockId, 'U-1', '1', 100, 'OCCUPIED', companyId]);
        unitId = unitRes.rows[0].id;

        const leaseRes = await query('INSERT INTO leases (unit_id, company_id, monthly_rent, start_date, end_date, deleted_at) VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL \'1 year\', NULL) RETURNING id',
            [unitId, companyId, 5000]);
        leaseId = leaseRes.rows[0].id;

        // 1. Delete Campus
        const delRes = await request(app).delete(`/api/campuses/${campusId}`);
        expect(delRes.status).toBe(204);

        // 2. Rollback
        const auditRes = await query('SELECT * FROM audit_logs WHERE entity_type = $1 ORDER BY created_at DESC LIMIT 1', ['CAMPUS']);
        const auditId = auditRes.rows[0].id;

        const rollRes = await request(app).post(`/api/rollback/${auditId}`);
        if (rollRes.status !== 200) console.error('ROLLBACK Error:', rollRes.status, rollRes.body);
        expect(rollRes.status).toBe(200);

        // 3. Verify
        const cCheck = await query('SELECT deleted_at FROM campuses WHERE id = $1', [campusId]);
        expect(cCheck.rows[0].deleted_at).toBeNull();

        const bCheck = await query('SELECT deleted_at FROM blocks WHERE id = $1', [blockId]);
        expect(bCheck.rows[0].deleted_at).toBeNull();

        const uCheck = await query('SELECT deleted_at FROM units WHERE id = $1', [unitId]);
        expect(uCheck.rows[0].deleted_at).toBeNull();

        const lCheck = await query('SELECT unit_id FROM leases WHERE id = $1', [leaseId]);
        expect(lCheck.rows[0].unit_id).toBe(unitId);
    });
});
