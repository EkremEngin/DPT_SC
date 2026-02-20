import express from 'express';
import { query } from '../db';
import { comparePassword, generateTokens, verifyToken, hashPassword } from '../services/authService';
import { audit } from '../services/auditService';
import { body, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate, commonValidations } from '../middleware/validationMiddleware';
import { createLoggerWithReq } from '../utils/logger';

const router = express.Router();

// Login
router.post('/login',
    validate([
        body('username').notEmpty().trim().withMessage('Username is required'),
        body('password').notEmpty().withMessage('Password is required')
    ]),
    async (req: any, res: any) => {

        const { username, password } = req.body;

        try {
            const result = await query('SELECT * FROM users WHERE username = $1', [username]);
            const user = result.rows[0];

            if (!user) {
                // Audit log could be added here
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const validPassword = await comparePassword(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const tokens = generateTokens(user);

            // Audit Log
            await audit('AUTH', 'LOGIN', 'Kullanıcı giriş yaptı', undefined, undefined, user.username, user.role);

            res.json({
                user: { id: user.id, username: user.username, role: user.role },
                ...tokens
            });

        } catch (error) {
            const log = createLoggerWithReq(req);
            log.error({ err: error }, 'Login error');
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Get Current User
router.get('/me', authenticateToken, async (req: AuthRequest, res: any) => {
    try {
        const result = await query('SELECT id, username, email, role, created_at FROM users WHERE id = $1', [req.user.id]);
        const user = result.rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update Profile (Password)
// SECURITY: Require currentPassword to verify identity before password change
// BACKWARD COMPATIBLE: currentPassword is optional, but strongly recommended
router.put('/profile', authenticateToken,
    validate([
        body('newPassword')
            .optional()
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters')
            .matches(/[A-Z]/)
            .withMessage('Password must contain at least one uppercase letter')
            .matches(/[a-z]/)
            .withMessage('Password must contain at least one lowercase letter')
            .matches(/[0-9]/)
            .withMessage('Password must contain at least one number'),
        body('currentPassword').optional()
    ]),
    async (req: AuthRequest, res: any) => {
        const { newPassword, currentPassword } = req.body;
        if (!newPassword) return res.json({ message: 'Nothing to update' });

        try {
            // SECURITY: If currentPassword is provided, verify it before allowing password change
            if (currentPassword) {
                const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
                if (userResult.rows.length === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }
                
                const isValidPassword = await comparePassword(currentPassword, userResult.rows[0].password_hash);
                if (!isValidPassword) {
                    return res.status(401).json({ error: 'Current password is incorrect' });
                }
            } else {
                // Log warning when password is changed without currentPassword verification
                const log = createLoggerWithReq(req);
                log.warn({ username: req.user.username }, '[SECURITY] Password change attempted without currentPassword verification');
            }

            const hash = await hashPassword(newPassword);
            await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
            
            await audit('AUTH', 'PASSWORD_CHANGE', 'Kullanıcı şifresini değiştirdi', undefined, undefined, req.user.username, req.user.role);
            
            res.json({ message: 'Profile updated successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

export default router;
