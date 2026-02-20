import express from 'express';
import { query } from '../db';
import { hashPassword } from '../services/authService';
import { authenticateToken } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/roleMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { body } from 'express-validator';
import { createLoggerWithReq } from '../utils/logger';

const router = express.Router();

// Get all users (Manager only)
router.get('/', authenticateToken, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
    try {
        const result = await query('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new user (Manager only)
router.post('/',
    authenticateToken,
    requireRole(['MANAGER', 'ADMIN']),
    validate([
        body('username')
            .notEmpty().trim().withMessage('Username is required')
            .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
            .isAlphanumeric().withMessage('Username must contain only letters and numbers'),
        body('password')
            .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
            .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
            .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
            .matches(/[0-9]/).withMessage('Password must contain at least one number'),
        body('email').isEmail().withMessage('Valid email is required'),
        body('role').isIn(['VIEWER', 'MANAGER', 'ADMIN']).optional().withMessage('Role must be one of: VIEWER, MANAGER, ADMIN')
    ]),
    async (req: any, res: any) => {

        const { username, password, email, role } = req.body;

        try {
            // Check if username exists
            const checkUsername = await query('SELECT id FROM users WHERE username = $1', [username]);
            if (checkUsername.rows.length > 0) {
                return res.status(400).json({ error: 'Username already exists' });
            }

            // Check if email exists
            const checkEmail = await query('SELECT id FROM users WHERE email = $1', [email]);
            if (checkEmail.rows.length > 0) {
                return res.status(400).json({ error: 'Bu e-posta adresi zaten kullanımda' });
            }

            const hash = await hashPassword(password);
            const result = await query(
                'INSERT INTO users (username, password_hash, email, role) VALUES ($1, $2, $3, $4) RETURNING id, username, role, created_at',
                [username, hash, email, role || 'VIEWER']
            );

            res.status(201).json(result.rows[0]);
        } catch (error) {
            const log = createLoggerWithReq(req);
            log.error({ err: error }, 'Create user error');
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Delete user (Manager only)
router.delete('/:id', authenticateToken, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
    const { id } = req.params;
    try {
        // Prevent deleting self (simple check)
        // Note: req.user.id is string, params.id is string
        // @ts-ignore
        if (req.user.id === id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
