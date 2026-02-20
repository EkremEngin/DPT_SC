import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { v4 as uuidv4 } from 'uuid';

const SALT_ROUNDS = 10;

// SECURITY: No hardcoded fallback - crash on startup if JWT_SECRET is missing
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!;

if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is required but not set');
}

const TOKEN_EXPIRY = '24h';
const REFRESH_TOKEN_EXPIRY = '7d';

export const hashPassword = async (password: string): Promise<string> => {
    return await bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
    return await bcrypt.compare(password, hash);
};

export const generateTokens = (user: { id: string, username: string, role: string }) => {
    const accessToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
        { id: user.id, tokenType: 'refresh' },
        JWT_REFRESH_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    return { accessToken, refreshToken };
};

export const verifyToken = (token: string, tokenType: 'access' | 'refresh' = 'access') => {
    try {
        const secret = tokenType === 'refresh' ? JWT_REFRESH_SECRET : JWT_SECRET;
        const decoded = jwt.verify(token, secret) as any;
        
        // SECURITY: Validate tokenType for refresh tokens
        if (tokenType === 'refresh' && decoded.tokenType !== 'refresh') {
            return null;
        }
        
        return decoded;
    } catch (error) {
        return null;
    }
};
