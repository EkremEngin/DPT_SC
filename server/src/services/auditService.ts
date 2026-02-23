import { query } from '../db';
import { logger } from '../utils/logger';

export const audit = async (
    entityType: 'LEASE' | 'UNIT' | 'BLOCK' | 'CAMPUS' | 'COMPANY' | 'AUTH' | 'SECTOR' | 'BUSINESS_AREA',
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'PASSWORD_CHANGE' | 'RESTORE',
    details: string,
    rollbackData?: any,
    impact?: string,
    user: string = 'Sistem Yöneticisi',
    userRole: string = 'Admin'
) => {
    try {
        await query(
            `INSERT INTO audit_logs (entity_type, action, details, rollback_data, impact, user_name, user_role)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [entityType, action, details, rollbackData ? JSON.stringify(rollbackData) : null, impact, user, userRole]
        );
    } catch (err) {
        logger.error({ err, entityType, action, details }, 'Failed to create audit log');
        // Do not throw, as audit failure shouldn't block main operation ideally,
        // but in high security contexts it should. Here we log error.
    }
};
