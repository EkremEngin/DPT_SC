import { Router } from 'express';
import { query } from '../db';
import { getPaginationParams, getSqlPagination } from '../utils/pagination';
import { createLoggerWithReq } from '../utils/logger';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const params = getPaginationParams(req);
        const { limit, offset } = getSqlPagination(params);

        // Get total count
        const countResult = await query('SELECT COUNT(*) FROM audit_logs');
        const totalCount = parseInt(countResult.rows[0].count);

        // Get paginated data
        const result = await query(
            'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2',
            [limit, offset]
        );

        const data = result.rows.map(row => ({
            id: row.id,
            traceId: row.trace_id,
            timestamp: row.timestamp,
            entityType: row.entity_type,
            action: row.action,
            details: row.details,
            user: row.user_name,
            userRole: row.user_role,
            rollbackData: row.rollback_data,
            impact: row.impact
        }));

        // Return with pagination metadata (preserving existing response structure)
        res.json({
            data,
            pagination: {
                page: params.page,
                limit: params.limit,
                totalCount,
                totalPages: Math.ceil(totalCount / params.limit)
            }
        });
    } catch (err) {
        createLoggerWithReq(req).error({ err }, '[AUDIT] Error fetching audit logs');
        res.status(500).json({ error: 'Database error' });
    }
});

// GET rollback preview for a specific audit log
// SECURITY: Require ADMIN role only
router.get('/:logId/rollback-preview', async (req, res) => {
    const { logId } = req.params;
    try {
        const result = await query('SELECT * FROM audit_logs WHERE id = $1', [logId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Audit log not found' });
        }

        const log = result.rows[0];
        
        // For now, return a safe response as full rollback is complex
        // This will be enhanced in later stages with soft delete restore capability
        res.json({
            type: 'SAFE',
            messages: [
                'Geri alma işlemi için veritabanı kaydı bulundu.',
                'Tam geri alma özelliği yakında eklenecek.',
                `İşlem: ${log.action} - ${log.entity_type}`,
                `Zaman: ${log.timestamp}`
            ]
        });
    } catch (err) {
        createLoggerWithReq(req).error({ err }, '[AUDIT] Error fetching rollback preview');
        res.status(500).json({ error: 'Database error' });
    }
});

// POST execute rollback for a specific audit log
// SECURITY: Require ADMIN role only
// NOTE: This is a placeholder for future implementation with soft delete
router.post('/:logId/rollback', async (req, res) => {
    const { logId } = req.params;
    try {
        const result = await query('SELECT * FROM audit_logs WHERE id = $1', [logId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Audit log not found' });
        }

        // For now, return success but don't actually rollback
        // Full rollback will be implemented with soft delete restore capability
        res.json({
            success: true,
            message: 'Geri alma işlemi yakında aktif olacak. Soft delete özelliği ile tam geri alma desteği eklenecek.'
        });
    } catch (err) {
        createLoggerWithReq(req).error({ err }, '[AUDIT] Error executing rollback');
        res.status(500).json({ error: 'Database error' });
    }
});

export default router;
