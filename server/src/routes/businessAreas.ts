import { Router } from 'express';
import { query } from '../db';
import { AuthRequest } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { audit } from '../services/auditService';
import { body } from 'express-validator';

const router = Router();

// GET all active business areas
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT name FROM business_areas WHERE deleted_at IS NULL ORDER BY name');
        res.json(result.rows.map(row => row.name));
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// POST create new business area
// SECURITY: Require ADMIN or MANAGER role
router.post('/', requireRole(['ADMIN', 'MANAGER']),
    validate([
        body('name').trim().isLength({ min: 2, max: 255 }).withMessage('Business area name must be between 2 and 255 characters')
    ]),
    async (req: AuthRequest, res: any) => {
        const { name } = req.body;
        const trimmedName = name.trim();

        try {
            // Check if business area exists (including soft deleted)
            const existing = await query('SELECT * FROM business_areas WHERE name = $1', [trimmedName]);

            if (existing.rows.length > 0) {
                const existingArea = existing.rows[0];
                if (existingArea.deleted_at) {
                    // Restore if soft deleted
                    await query('UPDATE business_areas SET deleted_at = NULL WHERE id = $1', [existingArea.id]);

                    await audit(
                        'BUSINESS_AREA',
                        'RESTORE',
                        `İş alanı etiketi geri yüklendi: ${trimmedName}`,
                        undefined,
                        undefined,
                        req.user?.username,
                        req.user?.role
                    ).catch(console.error);

                    return res.status(201).json({ success: true, message: 'Business area restored' });
                }
                return res.status(400).json({ error: 'Business area already exists' });
            }

            // Create new business area
            await query('INSERT INTO business_areas (name) VALUES ($1)', [trimmedName]);

            await audit(
                'BUSINESS_AREA',
                'CREATE',
                `Yeni iş alanı eklendi: ${trimmedName}`,
                undefined,
                undefined,
                req.user?.username,
                req.user?.role
            ).catch(console.error);

            res.status(201).json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Database error' });
        }
    }
);

// DELETE business area (soft delete)
// SECURITY: Require ADMIN or MANAGER role
router.delete('/:name', requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res: any) => {
    const { name } = req.params;

    try {
        const result = await query(
            'UPDATE business_areas SET deleted_at = CURRENT_TIMESTAMP WHERE name = $1 AND deleted_at IS NULL RETURNING *',
            [name]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Business area not found' });
        }

        await audit(
            'BUSINESS_AREA',
            'DELETE',
            `İş alanı silindi: ${name}`,
            undefined,
            undefined,
            req.user?.username,
            req.user?.role
        ).catch(console.error);

        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
