import { Router } from 'express';
import { query, transaction } from '../db';
import { audit } from '../services/auditService';
import { AuthRequest } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { body } from 'express-validator';
import { cacheConfig } from '../middleware/cacheMiddleware';
import { createLoggerWithReq } from '../utils/logger';

const router = Router();

// GET all blocks (optionally filter by campusId) with no caching to ensure real-time UI updates
router.get('/', cacheConfig.noCache, async (req, res) => {
    const { campusId } = req.query;
    try {
        let result;
        if (campusId) {
            result = await query('SELECT * FROM blocks WHERE campus_id = $1 AND deleted_at IS NULL ORDER BY display_order, name', [campusId]);
        } else {
            result = await query('SELECT * FROM blocks WHERE deleted_at IS NULL ORDER BY display_order, name');
        }

        const mappedRows = result.rows.map(row => ({
            id: row.id,
            campusId: row.campus_id,
            name: row.name,
            maxFloors: row.max_floors,
            maxOffices: row.max_offices,
            maxAreaSqM: parseFloat(row.max_area_sqm),
            defaultOperatingFee: parseFloat(row.default_operating_fee),
            sqMPerEmployee: parseFloat(row.sqm_per_employee),
            floorCapacities: row.floor_capacities
        }));

        res.json(mappedRows);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// POST new block
// SECURITY: Require ADMIN or MANAGER role
router.post('/', requireRole(['ADMIN', 'MANAGER']),
    validate([
        body('campusId').isUUID().withMessage('Campus ID must be a valid UUID'),
        body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Block name must be 2-50 characters'),
        body('maxFloors').optional().isInt({ min: 0 }).withMessage('Max floors must be a non-negative integer'),
        body('maxOffices').optional().isInt({ min: 0 }).withMessage('Max offices must be a non-negative integer'),
        body('maxAreaSqM').optional().isFloat({ min: 0 }).withMessage('Max area must be a positive number'),
        body('defaultOperatingFee').optional().isFloat({ min: 0 }).withMessage('Default operating fee must be a positive number'),
        body('sqMPerEmployee').optional().isFloat({ min: 1 }).withMessage('SqM per employee must be a positive number'),
        body('floorCapacities').optional().isArray().withMessage('Floor capacities must be an array')
    ]),
    async (req: AuthRequest, res: any) => {
        const { campusId, name, maxFloors, maxOffices, maxAreaSqM, defaultOperatingFee, sqMPerEmployee, floorCapacities } = req.body;
        try {
            await transaction(async (client) => {
                // Prevent duplicate blocks in the same campus
                const existing = await client.query('SELECT id FROM blocks WHERE campus_id = $1 AND name = $2 AND deleted_at IS NULL', [campusId, name]);
                if (existing.rows.length > 0) {
                    throw new Error('DUPLICATE_BLOCK');
                }

                const result = await client.query(
                    `INSERT INTO blocks (campus_id, name, max_floors, max_offices, max_area_sqm, default_operating_fee, sqm_per_employee, floor_capacities)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                    [campusId, name, maxFloors || 0, maxOffices || 0, maxAreaSqM || 0, defaultOperatingFee || 400, sqMPerEmployee || 5, JSON.stringify(floorCapacities || [])]
                );
                const newBlock = result.rows[0];

                await audit(
                    'BLOCK',
                    'CREATE',
                    `${newBlock.name} bloğu eklendi.`,
                    undefined,
                    undefined,
                    req.user?.username,
                    req.user?.role
                );

                // Map back to camelCase
                res.status(201).json({
                    id: newBlock.id,
                    campusId: newBlock.campus_id,
                    name: newBlock.name,
                    maxFloors: newBlock.max_floors,
                    maxOffices: newBlock.max_offices,
                    maxAreaSqM: parseFloat(newBlock.max_area_sqm),
                    defaultOperatingFee: parseFloat(newBlock.default_operating_fee),
                    sqMPerEmployee: parseFloat(newBlock.sqm_per_employee),
                    floorCapacities: newBlock.floor_capacities
                });
            });
        } catch (err: any) {
            if (err.message === 'DUPLICATE_BLOCK') {
                return res.status(400).json({ error: 'Bu kampüste aynı isimde bir blok zaten var.' });
            }
            const log = createLoggerWithReq(req);
            log.error({ err }, 'Database error');
            res.status(500).json({ error: 'Database error' });
        }
    });

// UPDATE block
// SECURITY: Require ADMIN or MANAGER role
router.put('/:id', requireRole(['ADMIN', 'MANAGER']),
    validate([
        body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Block name must be 2-50 characters'),
        body('defaultOperatingFee').optional().isFloat({ min: 0 }).withMessage('Default operating fee must be a positive number'),
        body('sqMPerEmployee').optional().isFloat({ min: 1 }).withMessage('SqM per employee must be a positive number'),
        body('floorCapacities').optional().isArray().withMessage('Floor capacities must be an array')
    ]),
    async (req: AuthRequest, res: any) => {
        const { id } = req.params;
        const { name, defaultOperatingFee, sqMPerEmployee, floorCapacities } = req.body;

        try {
            // Check if block exists
            const existingResult = await query('SELECT * FROM blocks WHERE id = $1 AND deleted_at IS NULL', [id]);
            if (existingResult.rows.length === 0) {
                return res.status(404).json({ error: 'Block not found' });
            }

            const result = await query(
                `UPDATE blocks SET
                name = COALESCE($1, name),
                default_operating_fee = COALESCE($2, default_operating_fee),
                sqm_per_employee = COALESCE($3, sqm_per_employee),
                floor_capacities = COALESCE($4, floor_capacities)
             WHERE id = $5 AND deleted_at IS NULL
             RETURNING *`,
                [name, defaultOperatingFee, sqMPerEmployee, floorCapacities ? JSON.stringify(floorCapacities) : null, id]
            );

            const updatedBlock = result.rows[0];

            await audit(
                'BLOCK',
                'UPDATE',
                `Blok güncellendi.`,
                undefined,
                undefined,
                req.user?.username,
                req.user?.role
            );

            res.json({
                id: updatedBlock.id,
                campusId: updatedBlock.campus_id,
                name: updatedBlock.name,
                maxFloors: updatedBlock.max_floors,
                maxOffices: updatedBlock.max_offices,
                maxAreaSqM: parseFloat(updatedBlock.max_area_sqm),
                defaultOperatingFee: parseFloat(updatedBlock.default_operating_fee),
                sqMPerEmployee: parseFloat(updatedBlock.sqm_per_employee),
                floorCapacities: updatedBlock.floor_capacities
            });
        } catch (err) {
            res.status(500).json({ error: 'Database error' });
        }
    });

// DELETE block (soft delete)
// SECURITY: Require ADMIN or MANAGER role
// DELETE block (soft delete with cascade logic)
// SECURITY: Require ADMIN or MANAGER role
router.delete('/:id', requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    try {
        await transaction(async (client) => {
            // 1. Check Block
            const blockRes = await client.query('SELECT * FROM blocks WHERE id = $1 AND deleted_at IS NULL', [id]);
            if (blockRes.rows.length === 0) {
                throw new Error('Block not found');
            }
            const block = blockRes.rows[0];

            // 2. Get Units
            let units: any[] = [];
            let unitIds: string[] = [];
            const unitsRes = await client.query('SELECT * FROM units WHERE block_id = $1 AND deleted_at IS NULL', [id]);
            units = unitsRes.rows;
            unitIds = units.map(u => u.id);

            // 3. Get Leases to be detached
            let leases: any[] = [];
            if (unitIds.length > 0) {
                const leasesRes = await client.query(`
                    SELECT l.*, u.area_sqm 
                    FROM leases l 
                    JOIN units u ON l.unit_id = u.id 
                    WHERE l.unit_id = ANY($1) AND l.deleted_at IS NULL
                `, [unitIds]);
                leases = leasesRes.rows;
            }

            // 4. Soft Delete Ops
            const now = new Date();
            await client.query('UPDATE blocks SET deleted_at = $1 WHERE id = $2', [now, id]);
            if (unitIds.length > 0) {
                await client.query('UPDATE units SET deleted_at = $1 WHERE id = ANY($2)', [now, unitIds]);
            }

            // 5. Update Leases
            for (const lease of leases) {
                let price = parseFloat(lease.unit_price_per_sqm || '0');
                if (price === 0 && lease.area_sqm > 0) {
                    price = parseFloat(lease.monthly_rent) / parseFloat(lease.area_sqm);
                }

                await client.query(
                    'UPDATE leases SET unit_id = NULL, monthly_rent = 0, unit_price_per_sqm = $1 WHERE id = $2',
                    [price, lease.id]
                );
            }

            // 6. Audit
            const rollbackData = {
                block,
                units,
                leases: leases.map(l => ({
                    id: l.id,
                    unit_id: l.unit_id,
                    monthly_rent: l.monthly_rent,
                    unit_price_per_sqm: l.unit_price_per_sqm
                }))
            };

            const details = `${block.name} bloğu ve bağlı ${units.length} ünite silindi. ${leases.length} sözleşme boşa çıkarıldı.`;
            const impact = `${units.length} Ünite, ${leases.length} Sözleşme etkilendi.`;

            await client.query(
                `INSERT INTO audit_logs (entity_type, action, details, rollback_data, impact, user_name, user_role)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                ['BLOCK', 'DELETE', details, JSON.stringify(rollbackData), impact, req.user?.username, req.user?.role]
            );
        });

        res.status(204).send();
    } catch (err: any) {
        if (err.message === 'Block not found') {
            return res.status(404).json({ error: 'Block not found' });
        }
        console.error('Delete block error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
