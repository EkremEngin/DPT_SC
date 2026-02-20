/**
 * Users Route Tests
 * 
 * Tests for users API endpoints:
 * - GET /api/users - List all users (MANAGER/ADMIN only)
 * - POST /api/users - Create new user (MANAGER/ADMIN only)
 * - DELETE /api/users/:id - Delete user (MANAGER/ADMIN only)
 */

import request from 'supertest';
import express from 'express';
import usersRouter from '../routes/users';
import { query } from '../db';
import { hashPassword, generateTokens } from '../services/authService';
import { authenticateToken } from '../middleware/authMiddleware';

const app = express();
app.use(express.json());

// Helper to mock authenticated user
function mockAuth(role: string = 'ADMIN') {
    return (req: any, res: any, next: any) => {
        (req as any).user = { id: 'admin-user-id', username: 'adminuser', role };
        next();
    };
}

describe('Users API', () => {
    let testUserIds: string[] = [];
    let adminToken: string;
    let managerToken: string;
    let viewerToken: string;

    beforeAll(async () => {
        // Generate tokens
        const adminTokens = generateTokens({ id: 'admin-user-id', username: 'adminuser', role: 'ADMIN' });
        adminToken = adminTokens.accessToken;

        const managerTokens = generateTokens({ id: 'manager-user-id', username: 'manageruser', role: 'MANAGER' });
        managerToken = managerTokens.accessToken;

        const viewerTokens = generateTokens({ id: 'viewer-user-id', username: 'vieweruser', role: 'VIEWER' });
        viewerToken = viewerTokens.accessToken;

        // Create test users for deletion tests
        const hashedPassword = await hashPassword('TestPassword123');
        for (let i = 0; i < 3; i++) {
            const result = await query(
                'INSERT INTO users (username, password_hash, email, role) VALUES ($1, $2, $3, $4) RETURNING id',
                [`testuser${i}`, hashedPassword, `testuser${i}@test.com`, 'VIEWER']
            );
            testUserIds.push(result.rows[0].id);
        }
    });

    afterAll(async () => {
        // Cleanup test data
        for (const userId of testUserIds) {
            await query('DELETE FROM users WHERE id = $1', [userId]);
        }
        // Also clean up any users created during tests
        await query("DELETE FROM users WHERE username LIKE 'test-create-%'");
    });

    describe('GET /api/users', () => {
        it('should return list of users for ADMIN', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should return list of users for MANAGER', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('MANAGER'), usersRouter);

            const response = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${managerToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should not include password_hash in response', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            if (response.body.length > 0) {
                expect(response.body[0]).not.toHaveProperty('password_hash');
                expect(response.body[0]).not.toHaveProperty('password');
            }
        });

        it('should include expected user properties', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            if (response.body.length > 0) {
                const user = response.body[0];
                expect(user).toHaveProperty('id');
                expect(user).toHaveProperty('username');
                expect(user).toHaveProperty('email');
                expect(user).toHaveProperty('role');
                expect(user).toHaveProperty('created_at');
            }
        });

        it('should return users ordered by created_at DESC', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            if (response.body.length > 1) {
                const dates = response.body.map((u: any) => new Date(u.created_at));
                for (let i = 1; i < dates.length; i++) {
                    expect(dates[i - 1] >= dates[i]).toBe(true);
                }
            }
        });
    });

    describe('POST /api/users', () => {
        it('should create a new user with valid data', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const userData = {
                username: 'testcreatenew',
                password: 'ValidPassword123',
                email: 'testcreatenew@test.com',
                role: 'VIEWER'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            if (response.status !== 201) {
                console.log('Create user failed:', response.body);
            }
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.username).toBe(userData.username);
            expect(response.body.role).toBe(userData.role);

            // Cleanup
            await query("DELETE FROM users WHERE username = 'testcreatenew'");
        });

        it('should default role to VIEWER if not provided', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const userData = {
                username: 'testcreatedefault',
                password: 'ValidPassword123',
                email: 'testcreatedefault@test.com'
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userData);

            expect(response.status).toBe(201);
            expect(response.body.role).toBe('VIEWER');

            // Cleanup
            await query("DELETE FROM users WHERE username = 'testcreatedefault'");
        });

        it('should validate username is not empty', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: '',
                    password: 'ValidPassword123',
                    email: 'test@test.com'
                });

            expect(response.status).toBe(400);
        });

        it('should validate username length (min 3, max 30)', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            // Test too short
            const shortResponse = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'ab',
                    password: 'ValidPassword123',
                    email: 'test@test.com'
                });

            expect(shortResponse.status).toBe(400);

            // Test too long
            const longResponse = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'a'.repeat(31),
                    password: 'ValidPassword123',
                    email: 'test@test.com'
                });

            expect(longResponse.status).toBe(400);
        });

        it('should validate username is alphanumeric', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'user@name',
                    password: 'ValidPassword123',
                    email: 'test@test.com'
                });

            expect(response.status).toBe(400);
        });

        it('should validate password length (min 8)', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'testuser',
                    password: 'Short1',
                    email: 'test@test.com'
                });

            expect(response.status).toBe(400);
        });

        it('should validate password contains uppercase letter', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'testuser',
                    password: 'lowercase123',
                    email: 'test@test.com'
                });

            expect(response.status).toBe(400);
        });

        it('should validate password contains lowercase letter', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'testuser',
                    password: 'UPPERCASE123',
                    email: 'test@test.com'
                });

            expect(response.status).toBe(400);
        });

        it('should validate password contains number', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'testuser',
                    password: 'NoNumbers',
                    email: 'test@test.com'
                });

            expect(response.status).toBe(400);
        });

        it('should validate email format', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'testuser',
                    password: 'ValidPassword123',
                    email: 'invalid-email'
                });

            expect(response.status).toBe(400);
        });

        it('should validate role is one of VIEWER, MANAGER, ADMIN', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'testuser',
                    password: 'ValidPassword123',
                    email: 'test@test.com',
                    role: 'INVALID_ROLE'
                });

            expect(response.status).toBe(400);
        });

        it('should reject duplicate username', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            // First user
            await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'testduplicate',
                    password: 'ValidPassword123',
                    email: 'unique1@test.com'
                });

            // Second user with same username
            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'testduplicate',
                    password: 'ValidPassword123',
                    email: 'unique2@test.com'
                });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');

            // Cleanup
            await query("DELETE FROM users WHERE username = 'testduplicate'");
        });

        it('should reject duplicate email', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            // First user
            await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'testuser1',
                    password: 'ValidPassword123',
                    email: 'duplicate@test.com'
                });

            // Second user with same email
            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'testuser2',
                    password: 'ValidPassword123',
                    email: 'duplicate@test.com'
                });

            expect(response.status).toBe(400);

            // Cleanup
            await query("DELETE FROM users WHERE email = 'duplicate@test.com'");
        });

        it('should not return password_hash in response', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'testnopwdreturn',
                    password: 'ValidPassword123',
                    email: 'nopwd@test.com'
                });

            expect(response.status).toBe(201);
            expect(response.body).not.toHaveProperty('password_hash');
            expect(response.body).not.toHaveProperty('password');

            // Cleanup
            await query("DELETE FROM users WHERE username = 'testnopwdreturn'");
        });
    });

    describe('DELETE /api/users/:id', () => {
        let deleteTestUserId: string;

        beforeEach(async () => {
            const hashedPassword = await hashPassword('TestPassword123');
            const result = await query(
                'INSERT INTO users (username, password_hash, email, role) VALUES ($1, $2, $3, $4) RETURNING id',
                ['deletetestuser', hashedPassword, 'deletetest@test.com', 'VIEWER']
            );
            deleteTestUserId = result.rows[0].id;
        });

        afterEach(async () => {
            await query("DELETE FROM users WHERE username = 'deletetestuser'");
        });

        it('should delete a user for ADMIN', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .delete(`/api/users/${deleteTestUserId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message');

            // Verify user is deleted
            const result = await query('SELECT * FROM users WHERE id = $1', [deleteTestUserId]);
            expect(result.rows.length).toBe(0);
        });

        it('should delete a user for MANAGER', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('MANAGER'), usersRouter);

            const response = await request(app)
                .delete(`/api/users/${deleteTestUserId}`)
                .set('Authorization', `Bearer ${managerToken}`);

            expect(response.status).toBe(200);
        });

        it('should prevent user from deleting themselves', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            // Try to delete the admin user
            const response = await request(app)
                .delete(`/api/users/admin-user-id`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        it('should handle non-existent user gracefully', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('ADMIN'), usersRouter);

            const response = await request(app)
                .delete('/api/users/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200); // Still returns 200 even if user doesn't exist
        });
    });

    describe('Authorization Tests', () => {
        it('should allow MANAGER to list users', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('MANAGER'), usersRouter);

            const response = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${managerToken}`);

            expect(response.status).toBe(200);
        });

        it('should allow MANAGER to create users', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('MANAGER'), usersRouter);

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({
                    username: 'testmanagercreate',
                    password: 'ValidPassword123',
                    email: 'manager-create@test.com',
                    role: 'VIEWER'
                });

            expect(response.status).toBe(201);

            // Cleanup
            await query("DELETE FROM users WHERE username = 'testmanagercreate'");
        });

        it('should allow MANAGER to delete users', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/users', mockAuth('MANAGER'), usersRouter);

            const hashedPassword = await hashPassword('TestPassword123');
            const result = await query(
                'INSERT INTO users (username, password_hash, email, role) VALUES ($1, $2, $3, $4) RETURNING id',
                ['managerdeletetest', hashedPassword, 'manager-delete@test.com', 'VIEWER']
            );
            const userId = result.rows[0].id;

            const response = await request(app)
                .delete(`/api/users/${userId}`)
                .set('Authorization', `Bearer ${managerToken}`);

            expect(response.status).toBe(200);
        });
    });
});
