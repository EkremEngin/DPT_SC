import { Router } from 'express';
import { query, transaction } from '../db';
import { audit } from '../services/auditService';
import { AuthRequest } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { body } from 'express-validator';
import { cacheConfig } from '../middleware/cacheMiddleware';

const router = Router();

// GET all campuses with static caching (5 minutes - rarely changes)
router.get('/', cacheConfig.static, async (req, res) => {
    try {
        const result = await query('SELECT * FROM campuses WHERE deleted_at IS NULL ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// POST new campus
// SECURITY: Require ADMIN or MANAGER role
router.post('/', requireRole(['ADMIN', 'MANAGER']),
    validate([
        body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Campus name must be 2-100 characters'),
        body('address').optional().trim().isLength({ max: 500 }).withMessage('Address must not exceed 500 characters'),
        body('maxOfficeCap').optional().isInt({ min: 0 }).withMessage('Max office capacity must be a positive integer'),
        body('maxAreaCap').optional().isFloat({ min: 0 }).withMessage('Max area capacity must be a positive number'),
        body('maxFloorsCap').optional().isInt({ min: 0 }).withMessage('Max floors capacity must be a positive integer')
    ]),
    async (req: AuthRequest, res: any) => {
        const { name, address, maxOfficeCap, maxAreaCap, maxFloorsCap } = req.body;
        try {
            const result = await query(
                `INSERT INTO campuses (name, address, max_office_cap, max_area_cap, max_floors_cap)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
                [name, address, maxOfficeCap || 0, maxAreaCap || 0, maxFloorsCap || 0]
            );
            const newCampus = result.rows[0];
            // Don't await audit to avoid blocking response
            audit(
                'CAMPUS',
                'CREATE',
                `${newCampus.name} kampüsü eklendi.`,
                undefined,
                undefined,
                req.user?.username,
                req.user?.role
            ).catch(auditErr => console.error('Audit failed:', auditErr));
            res.status(201).json(newCampus);
        } catch (err) {
            console.error('Campus creation error:', err);
            res.status(500).json({ error: 'Database error' });
        }
    });

// PUT update campus
// SECURITY: Require ADMIN or MANAGER role
router.put('/:id', requireRole(['ADMIN', 'MANAGER']),
    validate([
        body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Campus name must be 2-100 characters'),
        body('address').optional().trim().isLength({ max: 500 }).withMessage('Address must not exceed 500 characters'),
        body('maxOfficeCap').optional().isInt({ min: 0 }).withMessage('Max office capacity must be a positive integer'),
        body('maxAreaCap').optional().isFloat({ min: 0 }).withMessage('Max area capacity must be a positive number'),
        body('maxFloorsCap').optional().isInt({ min: 0 }).withMessage('Max floors capacity must be a positive integer')
    ]),
    async (req: AuthRequest, res: any) => {
        const { id } = req.params;
        const { name, address, maxOfficeCap, maxAreaCap, maxFloorsCap } = req.body;
        try {
            const campusResult = await query('SELECT * FROM campuses WHERE id = $1 AND deleted_at IS NULL', [id]);
            if (campusResult.rows.length === 0) {
                return res.status(404).json({ error: 'Campus not found' });
            }
            const campus = campusResult.rows[0];

            const updateFields: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (name !== undefined) {
                updateFields.push(`name = $${paramIndex++}`);
                values.push(name);
            }
            if (address !== undefined) {
                updateFields.push(`address = $${paramIndex++}`);
                values.push(address);
            }
            if (maxOfficeCap !== undefined) {
                updateFields.push(`max_office_cap = $${paramIndex++}`);
                values.push(maxOfficeCap);
            }
            if (maxAreaCap !== undefined) {
                updateFields.push(`max_area_cap = $${paramIndex++}`);
                values.push(maxAreaCap);
            }
            if (maxFloorsCap !== undefined) {
                updateFields.push(`max_floors_cap = $${paramIndex++}`);
                values.push(maxFloorsCap);
            }

            if (updateFields.length === 0) {
                return res.status(400).json({ error: 'No fields to update' });
            }

            values.push(id);
            const result = await query(
                `UPDATE campuses SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
                values
            );
            const updatedCampus = result.rows[0];

            await audit(
                'CAMPUS',
                'UPDATE',
                `${campus.name} kampüsü güncellendi.`,
                undefined,
                undefined,
                req.user?.username,
                req.user?.role
            );
            res.json(updatedCampus);
        } catch (err) {
            res.status(500).json({ error: 'Database error' });
        }
    });

// DELETE campus (soft delete)
// SECURITY: Require ADMIN or MANAGER role
// DELETE campus (soft delete with cascade logic)
// SECURITY: Require ADMIN or MANAGER role
router.delete('/:id', requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res: any) => {
    const { id } = req.params;

    try {
        await transaction(async (client) => {
            // 1. Check Campus
            const campusRes = await client.query('SELECT * FROM campuses WHERE id = $1 AND deleted_at IS NULL', [id]);
            if (campusRes.rows.length === 0) {
                // Must throw to trigger catch block in route handler
                throw new Error('Campus not found');
            }
            const campus = campusRes.rows[0];

            // 2. Get Blocks
            const blocksRes = await client.query('SELECT * FROM blocks WHERE campus_id = $1 AND deleted_at IS NULL', [id]);
            const blocks = blocksRes.rows;
            const blockIds = blocks.map(b => b.id);

            // 3. Get Units
            let units: any[] = [];
            let unitIds: string[] = [];
            if (blockIds.length > 0) {
                const unitsRes = await client.query('SELECT * FROM units WHERE block_id = ANY($1) AND deleted_at IS NULL', [blockIds]);
                units = unitsRes.rows;
                unitIds = units.map(u => u.id);
            }

            // 4. Get Leases to be detached (with area for price preservation)
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

            // 5. Soft Delete Ops
            const now = new Date();
            await client.query('UPDATE campuses SET deleted_at = $1 WHERE id = $2', [now, id]);

            if (blockIds.length > 0) {
                await client.query('UPDATE blocks SET deleted_at = $1 WHERE id = ANY($2)', [now, blockIds]);
            }

            if (unitIds.length > 0) {
                await client.query('UPDATE units SET deleted_at = $1 WHERE id = ANY($2)', [now, unitIds]);
            }

            // 6. Detach Leases & Preserve Price
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

            // 7. Audit with Rollback Data
            // We store the original state of modified entities
            const rollbackData = {
                campus,
                blocks,
                units,
                leases: leases.map(l => ({
                    id: l.id,
                    unit_id: l.unit_id,
                    monthly_rent: l.monthly_rent,
                    unit_price_per_sqm: l.unit_price_per_sqm
                }))
            };

            const details = `${campus.name} kampüsü ve bağlı ${blocks.length} blok, ${units.length} ünite silindi. ${leases.length} sözleşme boşa çıkarıldı.`;
            const impact = `${blocks.length} Blok, ${units.length} Ünite, ${leases.length} Sözleşme etkilendi.`;

            await client.query(
                `INSERT INTO audit_logs (entity_type, action, details, rollback_data, impact, user_name, user_role)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                ['CAMPUS', 'DELETE', details, JSON.stringify(rollbackData), impact, req.user?.username, req.user?.role]
            );
        });

        res.status(204).send();
    } catch (err: any) {
        if (err.message === 'Campus not found') {
            return res.status(404).json({ error: 'Campus not found' });
        }
        console.error('Delete campus error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
