/**
 * Authentication API Tests
 *
 * Tests for user authentication, login, and token validation
 */

import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { query } from '../db';
import authRoutes from '../routes/auth';
import { authenticateToken } from '../middleware/authMiddleware';

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: string;
      };
    }
  }
}

// Create a test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Authentication API', () => {
  let testUserId: string;
  let testUsername: string;
  let testPassword: string;
  let accessToken: string;

  beforeAll(async () => {
    // Create a test user
    testUsername = `testuser_${Date.now()}`;
    testPassword = 'TestPassword123!';
    const hashedPassword = await bcrypt.hash(testPassword, 10);

    const result = await query(
      'INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [uuidv4(), testUsername, hashedPassword, 'MANAGER']
    );
    testUserId = result.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test user
    await query('DELETE FROM users WHERE username = $1', [testUsername]);
  });

  describe('POST /api/auth/login', () => {
    it('should successfully login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUsername,
          password: testPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.username).toBe(testUsername);
      expect(response.body.user.role).toBe('MANAGER');
      
      accessToken = response.body.accessToken;
    });

    it('should fail with invalid username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistentuser',
          password: testPassword,
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should fail with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUsername,
          password: 'WrongPassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should fail with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUsername,
        });

      expect(response.status).toBe(400);
    });

    it('should handle multiple login attempts', async () => {
      // Attempt multiple failed logins
      const promises = Array(6).fill(null).map(() =>
        request(app)
          .post('/api/auth/login')
          .send({
            username: testUsername,
            password: 'WrongPassword',
          })
      );

      const responses = await Promise.all(promises);
      
      // All failed attempts should return 401
      responses.forEach(response => {
        expect([401, 429]).toContain(response.status); // Either unauthorized or rate limited
      });
    });
  });

  describe('Token Validation', () => {
    it('should accept valid JWT token', async () => {
      const testApp = express();
      testApp.get('/protected', authenticateToken, (req: Request, res: Response) => {
        res.json({ message: 'Access granted', user: (req as any).user });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Access granted');
      expect(response.body.user).toHaveProperty('username');
    });

    it('should reject requests without token', async () => {
      const testApp = express();
      testApp.get('/protected', authenticateToken, (req: Request, res: Response) => {
        res.json({ message: 'Access granted' });
      });

      const response = await request(testApp)
        .get('/protected');

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid token', async () => {
      const testApp = express();
      testApp.get('/protected', authenticateToken, (req: Request, res: Response) => {
        res.json({ message: 'Access granted' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', 'Bearer invalid-token-here');

      expect(response.status).toBe(403);
    });
  });
});
