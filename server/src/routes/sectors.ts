import { Router } from 'express';
import { query } from '../db';
import { AuthRequest } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { audit } from '../services/auditService';
import { body } from 'express-validator';

const router = Router();

// GET all active sectors
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT name FROM sectors WHERE deleted_at IS NULL ORDER BY name');
        res.json(result.rows.map(row => row.name));
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// POST create new sector
// SECURITY: Require ADMIN or MANAGER role
router.post('/', requireRole(['ADMIN', 'MANAGER']),
    validate([
        body('sector').trim().isLength({ min: 2, max: 255 }).withMessage('Sector name must be between 2 and 255 characters')
    ]),
    async (req: AuthRequest, res: any) => {
        const { sector } = req.body;

        try {
            // Check if sector exists (including soft deleted)
            const existing = await query('SELECT * FROM sectors WHERE name = $1', [sector]);

            if (existing.rows.length > 0) {
                const existingSector = existing.rows[0];
                if (existingSector.deleted_at) {
                    // Restore if soft deleted
                    await query('UPDATE sectors SET deleted_at = NULL WHERE id = $1', [existingSector.id]);

                    await audit(
                        'SECTOR',
                        'RESTORE',
                        `Sektör geri yüklendi: ${sector}`,
                        undefined,
                        undefined,
                        req.user?.username,
                        req.user?.role
                    ).catch(console.error);

                    return res.status(201).json({ success: true, message: 'Sector restored' });
                }
                return res.status(400).json({ error: 'Sector already exists' });
            }

            // Create new sector
            await query('INSERT INTO sectors (name) VALUES ($1)', [sector]);

            await audit(
                'SECTOR',
                'CREATE',
                `Yeni sektör eklendi: ${sector}`,
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

// DELETE sector (soft delete)
// SECURITY: Require ADMIN or MANAGER role
router.delete('/:name', requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res: any) => {
    const { name } = req.params;

    try {
        // Build query
        // Note: The frontend sends name in URL. It might be URI encoded. Express handles decoding usually.
        // We use name to find the record.

        const result = await query(
            'UPDATE sectors SET deleted_at = CURRENT_TIMESTAMP WHERE name = $1 AND deleted_at IS NULL RETURNING *',
            [name]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sector not found' });
        }

        await audit(
            'SECTOR',
            'DELETE',
            `Sektör silindi: ${name}`,
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
