import { Router } from 'express';
import { query, transaction } from '../db';
import { audit } from '../services/auditService';
import { AuthRequest } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';

const router = Router();

// GET Rollback Preview
// SECURITY: Require ADMIN role
router.get('/:auditId/preview', requireRole(['ADMIN']), async (req: AuthRequest, res: any) => {
    const { auditId } = req.params;
    try {
        const logRes = await query('SELECT * FROM audit_logs WHERE id = $1', [auditId]);
        if (logRes.rows.length === 0) return res.status(404).json({ error: 'Audit log not found' });
        const log = logRes.rows[0];

        if (!log.rollback_data) {
            return res.json({
                type: 'UNSAFE',
                messages: ['Bu işlem için geri alma verisi bulunmuyor.']
            });
        }

        const data = log.rollback_data;
        const messages: string[] = [];
        let type = 'SAFE';

        // Check conflicts (simulated for now, can be enhanced)
        // E.g. check if unit is currently occupied by someone else?
        // Since we soft-delete, ID collision is possible if we re-created same ID? 
        // No, IDs are UUID or auto-inc unique.
        // But logical collision: Unit U-1 deleted, then new U-1 created.
        // If we restore old U-1, we have two U-1s?
        // Our system permits duplicate names if deleted_at is different?
        // Constraint: unique(name, campus_id) where deleted_at IS NULL.
        // So if active U-1 exists, restoring old U-1 might fail unique constraint.

        if (log.entity_type === 'CAMPUS') {
            messages.push(`${data.campus?.name} kampüsü ve bağlı ${data.blocks?.length || 0} blok, ${data.units?.length || 0} ünite geri getirilecek.`);
            messages.push(`${data.leases?.length || 0} sözleşme eski haline döndürülecek.`);
        } else if (log.entity_type === 'BLOCK') {
            messages.push(`${data.block?.name} bloğu ve bağlı ${data.units?.length || 0} ünite geri getirilecek.`);
        } else if (log.entity_type === 'UNIT') {
            messages.push(`${data.unit?.number} ünitesi geri getirilecek.`);
        }

        // Check if 7 days passed
        const diffTime = Math.abs(new Date().getTime() - new Date(log.created_at).getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 7) {
            type = 'UNSAFE';
            messages.push('7 günden eski kayıtlar geri alınamaz (Güvenlik Politikası).');
        }

        res.json({ type, messages });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:auditId', requireRole(['ADMIN']), async (req: AuthRequest, res: any) => {
    const { auditId } = req.params;

    try {
        const result = await transaction(async (client) => {
            // 1. Fetch Audit Log
            const logRes = await client.query('SELECT * FROM audit_logs WHERE id = $1', [auditId]);
            if (logRes.rows.length === 0) throw { status: 404, message: 'Audit log not found' };
            const log = logRes.rows[0];

            if (!log.rollback_data) throw { status: 400, message: 'No rollback data available for this action' };

            const data = log.rollback_data;

            // 2. Switch Action
            if (log.entity_type === 'CAMPUS' && log.action === 'DELETE') {
                // Restore Campus
                if (data.campus) {
                    await client.query('UPDATE campuses SET deleted_at = NULL WHERE id = $1', [data.campus.id]);
                }
                // Restore Blocks
                if (data.blocks && data.blocks.length > 0) {
                    const blockIds = data.blocks.map((b: any) => b.id);
                    await client.query('UPDATE blocks SET deleted_at = NULL WHERE id = ANY($1)', [blockIds]);
                }
                // Restore Units
                if (data.units && data.units.length > 0) {
                    const unitIds = data.units.map((u: any) => u.id);
                    await client.query('UPDATE units SET deleted_at = NULL WHERE id = ANY($1)', [unitIds]);
                }
                // Restore Leases (Re-attach)
                if (data.leases && data.leases.length > 0) {
                    for (const lease of data.leases) {
                        await client.query('UPDATE leases SET unit_id = $1, monthly_rent = $2, start_date = $3, end_date = $4 WHERE id = $5',
                            [lease.unit_id, lease.monthly_rent, lease.start_date, lease.end_date, lease.id]);
                    }
                }
            } else if (log.entity_type === 'BLOCK' && log.action === 'DELETE') {
                if (data.block) {
                    await client.query('UPDATE blocks SET deleted_at = NULL WHERE id = $1', [data.block.id]);
                }
                if (data.units && data.units.length > 0) {
                    const unitIds = data.units.map((u: any) => u.id);
                    await client.query('UPDATE units SET deleted_at = NULL WHERE id = ANY($1)', [unitIds]);
                }
                if (data.leases && data.leases.length > 0) {
                    for (const lease of data.leases) {
                        await client.query('UPDATE leases SET unit_id = $1, monthly_rent = $2, start_date = $3, end_date = $4 WHERE id = $5',
                            [lease.unit_id, lease.monthly_rent, lease.start_date, lease.end_date, lease.id]);
                    }
                }
            } else if (log.entity_type === 'UNIT' && log.action === 'DELETE') {
                if (data.unit) {
                    await client.query('UPDATE units SET deleted_at = NULL WHERE id = $1', [data.unit.id]);
                }
                if (data.leases && data.leases.length > 0) {
                    for (const lease of data.leases) {
                        await client.query('UPDATE leases SET unit_id = $1, monthly_rent = $2, start_date = $3, end_date = $4 WHERE id = $5',
                            [lease.unit_id, lease.monthly_rent, lease.start_date, lease.end_date, lease.id]);
                    }
                }
            } else {
                throw { status: 400, message: 'Rollback not supported for this action type' };
            }

            return log; // Return log for external use
        });

        const log = result;

        // Post-transaction Audit
        if (log) { // Check if log was successfully retrieved and assigned
            await audit(
                log.entity_type as any,
                'RESTORE',
                `Rollback performed for audit #${auditId}`,
                undefined,
                undefined,
                req.user?.username,
                req.user?.role
            );
        }

        res.json({ success: true, message: 'Rollback successful' });

    } catch (err: any) {
        const status = err.status || 500;
        const message = err.message || 'Rollback failed';
        res.status(status).json({ error: message });
    }
});

export default router;
