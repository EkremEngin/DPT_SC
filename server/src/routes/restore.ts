import { Router } from 'express';
import { query, transaction } from '../db';
import { audit } from '../services/auditService';
import { AuthRequest } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import { createLoggerWithReq } from '../utils/logger';

const router = Router();

// RESTORE Campus
// SECURITY: Require ADMIN role only
router.post('/campuses/:id', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
        // Check if campus exists (any state)
        const existsCheck = await query('SELECT * FROM campuses WHERE id = $1', [id]);
        if (existsCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Campus not found' });
        }

        const campus = existsCheck.rows[0];
        
        // Check if campus is already active
        if (campus.deleted_at === null) {
            return res.status(400).json({ error: 'Campus is already active' });
        }
        
        await query('UPDATE campuses SET deleted_at = NULL WHERE id = $1', [id]);

        await audit(
            'CAMPUS',
            'RESTORE',
            `${campus.name} kampüsü geri yüklendi.`,
            undefined,
            undefined,
            req.user?.username,
            req.user?.role
        );
        
        // Fetch restored campus and return it
        const restoredCampus = await query('SELECT * FROM campuses WHERE id = $1', [id]);
        res.json({
            id: restoredCampus.rows[0].id,
            name: restoredCampus.rows[0].name,
            address: restoredCampus.rows[0].address,
            maxOfficeCap: restoredCampus.rows[0].max_office_cap,
            maxAreaCap: parseFloat(restoredCampus.rows[0].max_area_cap),
            maxFloorsCap: restoredCampus.rows[0].max_floors_cap,
            createdAt: restoredCampus.rows[0].created_at
        });
    } catch (err) {
        createLoggerWithReq(req).error({ err }, '[RESTORE] Error restoring campus');
        res.status(500).json({ error: 'Database error' });
    }
});

// RESTORE Block
// SECURITY: Require ADMIN role only
router.post('/blocks/:id', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
        const result = await query('SELECT * FROM blocks WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Deleted block not found' });
        }

        const block = result.rows[0];

        // Check if campus is deleted - restore it if needed
        const campusCheck = await query('SELECT * FROM campuses WHERE id = $1', [block.campus_id]);
        if (campusCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Cannot restore block: campus does not exist' });
        }
        if (campusCheck.rows[0].deleted_at !== null) {
            // Restore campus first
            await query('UPDATE campuses SET deleted_at = NULL WHERE id = $1', [block.campus_id]);
        }

        await query('UPDATE blocks SET deleted_at = NULL WHERE id = $1', [id]);

        await audit(
            'BLOCK',
            'RESTORE',
            `${block.name} bloğu geri yüklendi.`,
            undefined,
            undefined,
            req.user?.username,
            req.user?.role
        );

        // Fetch restored block and return it
        const restoredBlock = await query('SELECT * FROM blocks WHERE id = $1', [id]);
        res.json({
            id: restoredBlock.rows[0].id,
            campusId: restoredBlock.rows[0].campus_id,
            name: restoredBlock.rows[0].name,
            maxFloors: restoredBlock.rows[0].max_floors,
            maxOffices: restoredBlock.rows[0].max_offices,
            maxAreaSqM: parseFloat(restoredBlock.rows[0].max_area_sqm),
            defaultOperatingFee: parseFloat(restoredBlock.rows[0].default_operating_fee),
            sqMPerEmployee: parseFloat(restoredBlock.rows[0].sqm_per_employee),
            floorCapacities: restoredBlock.rows[0].floor_capacities
        });
    } catch (err) {
        createLoggerWithReq(req).error({ err }, '[RESTORE] Error restoring block');
        res.status(500).json({ error: 'Database error' });
    }
});

// RESTORE Unit
// SECURITY: Require ADMIN role only
router.post('/units/:id', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
        const result = await query('SELECT * FROM units WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Deleted unit not found' });
        }

        const unit = result.rows[0];

        // Get block info to check campus
        const blockCheck = await query('SELECT * FROM blocks WHERE id = $1', [unit.block_id]);
        if (blockCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Cannot restore unit: block does not exist' });
        }

        // Restore campus if deleted
        if (blockCheck.rows[0].deleted_at !== null) {
            const campusId = blockCheck.rows[0].campus_id;
            await query('UPDATE campuses SET deleted_at = NULL WHERE id = $1', [campusId]);
        }

        // Restore block if deleted
        if (blockCheck.rows[0].deleted_at !== null) {
            await query('UPDATE blocks SET deleted_at = NULL WHERE id = $1', [unit.block_id]);
        }

        await query('UPDATE units SET deleted_at = NULL WHERE id = $1', [id]);

        await audit(
            'UNIT',
            'RESTORE',
            `Birim ${unit.number} geri yüklendi.`,
            undefined,
            undefined,
            req.user?.username,
            req.user?.role
        );

        // Fetch restored unit and return it
        const restoredUnit = await query('SELECT * FROM units WHERE id = $1', [id]);
        res.json({
            id: restoredUnit.rows[0].id,
            blockId: restoredUnit.rows[0].block_id,
            number: restoredUnit.rows[0].number,
            floor: restoredUnit.rows[0].floor,
            areaSqM: parseFloat(restoredUnit.rows[0].area_sqm),
            status: restoredUnit.rows[0].status,
            companyId: restoredUnit.rows[0].company_id
        });
    } catch (err) {
        createLoggerWithReq(req).error({ err }, '[RESTORE] Error restoring unit');
        res.status(500).json({ error: 'Database error' });
    }
});

// RESTORE Company
// SECURITY: Require ADMIN role only
router.post('/companies/:id', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
        const result = await query('SELECT * FROM companies WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Deleted company not found' });
        }

        const company = result.rows[0];

        // Restore company
        await query('UPDATE companies SET deleted_at = NULL WHERE id = $1', [id]);

        // Restore related records
        await query('UPDATE company_documents SET deleted_at = NULL WHERE company_id = $1', [id]);
        await query('UPDATE company_score_entries SET deleted_at = NULL WHERE company_id = $1', [id]);
        await query('UPDATE leases SET deleted_at = NULL WHERE company_id = $1', [id]);

        await audit(
            'COMPANY',
            'RESTORE',
            `${company.name} firması geri yüklendi.`,
            undefined,
            undefined,
            req.user?.username,
            req.user?.role
        );

        // Fetch restored company and return it
        const restoredCompany = await query('SELECT * FROM companies WHERE id = $1', [id]);
        res.json({
            id: restoredCompany.rows[0].id,
            name: restoredCompany.rows[0].name,
            email: restoredCompany.rows[0].email,
            phone: restoredCompany.rows[0].phone,
            sector: restoredCompany.rows[0].sector,
            website: restoredCompany.rows[0].website,
            address: restoredCompany.rows[0].address
        });
    } catch (err) {
        createLoggerWithReq(req).error({ err }, '[RESTORE] Error restoring company');
        res.status(500).json({ error: 'Database error' });
    }
});

// RESTORE Lease
// SECURITY: Require ADMIN role only
router.post('/leases/:companyId', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    const { companyId } = req.params;
    try {
        // Find the most recent deleted lease for this company
        const leaseResult = await query(
            'SELECT * FROM leases WHERE company_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1',
            [companyId]
        );
        if (leaseResult.rows.length === 0) {
            return res.status(404).json({ error: 'No deleted lease found for this company' });
        }
        const lease = leaseResult.rows[0];

        // Check if company is deleted and restore it
        const companyCheck = await query('SELECT * FROM companies WHERE id = $1', [companyId]);
        if (companyCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }
        if (companyCheck.rows[0].deleted_at !== null) {
            await query('UPDATE companies SET deleted_at = NULL WHERE id = $1', [companyId]);
        }

        // Restore lease
        await query('UPDATE leases SET deleted_at = NULL WHERE id = $1', [lease.id]);

        // Restore related records
        await query('UPDATE company_documents SET deleted_at = NULL WHERE company_id = $1', [companyId]);
        await query('UPDATE company_score_entries SET deleted_at = NULL WHERE company_id = $1', [companyId]);

        await audit(
            'LEASE',
            'RESTORE',
            `${companyCheck.rows[0].name} firması ve sözleşmesi geri yüklendi.`,
            undefined,
            undefined,
            req.user?.username,
            req.user?.role
        );

        // Fetch restored lease and return it
        const restoredLease = await query('SELECT * FROM leases WHERE id = $1', [lease.id]);
        res.json({
            id: restoredLease.rows[0].id,
            companyId: restoredLease.rows[0].company_id,
            unitId: restoredLease.rows[0].unit_id,
            startDate: restoredLease.rows[0].start_date,
            endDate: restoredLease.rows[0].end_date,
            monthlyRent: parseFloat(restoredLease.rows[0].monthly_rent)
        });
    } catch (err) {
        createLoggerWithReq(req).error({ err }, '[RESTORE] Error restoring lease');
        res.status(500).json({ error: 'Database error' });
    }
});

// GET all deleted items (for admin restore UI)
// SECURITY: Require ADMIN role only
router.get('/deleted', requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
        const [campuses, blocks, units, companies, leases] = await Promise.all([
            query('SELECT id, name, deleted_at FROM campuses WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'),
            query('SELECT id, name, deleted_at FROM blocks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'),
            query('SELECT id, number as name, deleted_at FROM units WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'),
            query('SELECT id, name, deleted_at FROM companies WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'),
            query('SELECT l.id, c.name as name, l.deleted_at FROM leases l JOIN companies c ON l.company_id = c.id WHERE l.deleted_at IS NOT NULL ORDER BY l.deleted_at DESC')
        ]);

        // Flatten results into a single array with type property
        const deletedItems = [
            ...campuses.rows.map(item => ({ ...item, type: 'campus' })),
            ...blocks.rows.map(item => ({ ...item, type: 'block' })),
            ...units.rows.map(item => ({ ...item, type: 'unit' })),
            ...companies.rows.map(item => ({ ...item, type: 'company' })),
            ...leases.rows.map(item => ({ ...item, type: 'lease' }))
        ];

        res.json(deletedItems);
    } catch (err) {
        createLoggerWithReq(req).error({ err }, '[RESTORE] Error fetching deleted items');
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
