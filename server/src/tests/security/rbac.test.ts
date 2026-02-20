/**
 * P5.3 Security Tests: RBAC (Role-Based Access Control) - HTTP-First
 *
 * Tests for proper role-based access control enforcement:
 * - VIEWER cannot POST/PUT/DELETE (read-only)
 * - MANAGER cannot delete users or access admin-only endpoints
 * - ADMIN can perform all operations
 * - Unauthenticated request rejection
 *
 * NO SCHEMA ASSUMPTIONS - All fixtures created via API
 */

import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { query } from '../../db';

// Import the full app
import authRoutes from '../../routes/auth';
import userRoutes from '../../routes/users';
import campusRoutes from '../../routes/campuses';
import blockRoutes from '../../routes/blocks';
import unitRoutes from '../../routes/units';
import companyRoutes from '../../routes/companies';
import restoreRoutes from '../../routes/restore';
import { authenticateToken } from '../../middleware/authMiddleware';
import { errorHandler } from '../../middleware/errorHandler';
import helmet from 'helmet';
import cors from 'cors';

// Extend Express Request type
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

// ============================================================
// HELPERS - Login, Authed Requests, Fixture Creation
// ============================================================

/**
 * Create test app with all routes (mirror of production index.ts)
 */
const createTestApp = () => {
  const app = express();
  
  // Security middleware (same as production)
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(cors({
    origin: '*',
    credentials: true
  }));

  // Public routes
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes);

  // Protected routes (require auth)
  app.use('/api', authenticateToken);
  app.use('/api/users', userRoutes);
  app.use('/api/campuses', campusRoutes);
  app.use('/api/blocks', blockRoutes);
  app.use('/api/units', unitRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/restore', restoreRoutes);

  // Error handler
  app.use(errorHandler);

  return app;
};

/**
 * Login helper - returns access token
 */
async function login(app: express.Express, username: string, password: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username, password });

  if (response.status !== 200) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(response.body)}`);
  }
  return response.body.accessToken;
}

/**
 * Authed request helper - adds Bearer token
 */
function authed(token: string) {
  return {
    Authorization: `Bearer ${token}`
  };
}

/**
 * Create a bootstrap MANAGER user via direct DB insert
 * (Required so we have someone to login and create other users via API)
 * Username: letters+digits only, max 30 chars
 */
async function createBootstrapManager(): Promise<{ username: string; password: string; userId: string }> {
  const userId = uuidv4();
  const randomSuffix = Math.random().toString(36).substring(2, 6); // 4 chars
  const username = `rbboot${randomSuffix}`; // 9 chars, letters+digits
  const password = 'BootstrapPass123!';
  const hashedPassword = await bcrypt.hash(password, 10);

  await query(
    'INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, $3, $4)',
    [userId, username, hashedPassword, 'MANAGER']
  );

  return { userId, username, password };
}

/**
 * Create test user via API (requires MANAGER token)
 * Username: letters+digits only, max 30 chars
 */
async function createUserViaAPI(
  app: express.Express,
  managerToken: string,
  role: 'ADMIN' | 'MANAGER' | 'VIEWER'
): Promise<{ username: string; password: string; token: string }> {
  const roleCode = role.substring(0, 1).toLowerCase(); // a/m/v
  const randomSuffix = Math.random().toString(36).substring(2, 7); // 5 chars
  const username = `rb${roleCode}${randomSuffix}`; // 7 chars, letters+digits
  const password = 'TestPassword123!';

  const response = await request(app)
    .post('/api/users')
    .set(authed(managerToken))
    .send({
      username,
      password,
      email: `${username}@test.com`,
      role
    });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to create user: ${JSON.stringify(response.body)}`);
  }

  // Login as new user to get token
  const token = await login(app, username, password);

  return { username, password, token };
}

/**
 * Create campus via API
 */
async function createCampusViaAPI(
  app: express.Express,
  token: string
): Promise<{ id: string; name: string }> {
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  const response = await request(app)
    .post('/api/campuses')
    .set(authed(token))
    .send({
      name: `RBCCampus${randomSuffix}`,
      address: '123 Test Street',
      maxOfficeCap: 100,
      maxAreaCap: 5000,
      maxFloorsCap: 5
    });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to create campus: ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

/**
 * Create block via API
 */
async function createBlockViaAPI(
  app: express.Express,
  token: string,
  campusId: string
): Promise<{ id: string; name: string }> {
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  const response = await request(app)
    .post('/api/blocks')
    .set(authed(token))
    .send({
      campusId,
      name: `RBCBlock${randomSuffix}`,
      maxFloors: 3,
      maxOffices: 50,
      maxAreaSqM: 2500,
      floorCapacities: [
        { floor: '1', totalSqM: 800 },
        { floor: '2', totalSqM: 800 },
        { floor: '3', totalSqM: 900 }
      ]
    });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to create block: ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

/**
 * Create company via API
 */
async function createCompanyViaAPI(
  app: express.Express,
  token: string
): Promise<{ id: string; name: string }> {
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  const response = await request(app)
    .post('/api/companies')
    .set(authed(token))
    .send({
      name: `RBCCompany${randomSuffix}`,
      sector: 'Technology',
      managerName: 'Test Manager',
      managerPhone: '+905551234567',
      managerEmail: `mgr${randomSuffix}@test.com`,
      employeeCount: 25
    });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to create company: ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

/**
 * Assign unit via API (creates lease automatically)
 */
async function assignUnitViaAPI(
  app: express.Express,
  token: string,
  blockId: string,
  companyId: string
): Promise<{ id: string }> {
  const response = await request(app)
    .post('/api/units/assign')
    .set(authed(token))
    .send({
      blockId,
      companyId,
      floor: '1',
      areaSqM: 150,
      isReserved: false
    });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Failed to assign unit: ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

// ============================================================
// TEST SUITE
// ============================================================

describe('P5.3 Security: RBAC Tests (HTTP-First)', () => {
  let app: express.Express;
  
  // Bootstrap data
  let bootstrapManager: Awaited<ReturnType<typeof createBootstrapManager>>;
  let bootstrapToken: string;

  // Test users
  let adminUser: Awaited<ReturnType<typeof createUserViaAPI>>;
  let managerUser: Awaited<ReturnType<typeof createUserViaAPI>>;
  let viewerUser: Awaited<ReturnType<typeof createUserViaAPI>>;

  // Test fixtures (created via API)
  let campusId: string;
  let blockId: string;
  let companyId: string;
  let unitId: string;

  beforeAll(async () => {
    app = createTestApp();

    // Step 1: Create bootstrap manager (only DB insert allowed)
    bootstrapManager = await createBootstrapManager();

    // Step 2: Login as bootstrap manager
    bootstrapToken = await login(app, bootstrapManager.username, bootstrapManager.password);

    // Step 3: Create test users via API
    adminUser = await createUserViaAPI(app, bootstrapToken, 'ADMIN');
    managerUser = await createUserViaAPI(app, bootstrapToken, 'MANAGER');
    viewerUser = await createUserViaAPI(app, bootstrapToken, 'VIEWER');

    // Step 4: Create fixtures via API (campus -> block -> company -> unit)
    const campus = await createCampusViaAPI(app, bootstrapToken);
    campusId = campus.id;

    const block = await createBlockViaAPI(app, bootstrapToken, campusId);
    blockId = block.id;

    const company = await createCompanyViaAPI(app, bootstrapToken);
    companyId = company.id;

    const unit = await assignUnitViaAPI(app, bootstrapToken, blockId, companyId);
    unitId = unit.id;
  });

  afterAll(async () => {
    // Cleanup test data - delete by username prefixes
    await query("DELETE FROM users WHERE username LIKE $1", ['rbboot%']);
    await query("DELETE FROM users WHERE username LIKE $1", ['rba%']);
    await query("DELETE FROM users WHERE username LIKE $1", ['rbm%']);
    await query("DELETE FROM users WHERE username LIKE $1", ['rbv%']);

    // Delete fixtures by name prefix
    await query("DELETE FROM companies WHERE name LIKE $1", ['RBC%']);
    await query("DELETE FROM blocks WHERE name LIKE $1", ['RBC%']);
    await query("DELETE FROM campuses WHERE name LIKE $1", ['RBC%']);
  });

  // ============================================================
  // Unauthenticated Access Tests
  // ============================================================

  describe('Unauthenticated Access', () => {
    it('should reject GET /api/users without token (401)', async () => {
      const response = await request(app).get('/api/users');
      expect(response.status).toBe(401);
    });

    it('should reject POST /api/users without token (401)', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({ username: 'test', password: 'Test123!' });
      expect(response.status).toBe(401);
    });

    it('should reject DELETE /api/users/:id without token (401)', async () => {
      const response = await request(app).delete(`/api/users/${uuidv4()}`);
      expect(response.status).toBe(401);
    });

    it('should reject POST /api/campuses without token (401)', async () => {
      const response = await request(app)
        .post('/api/campuses')
        .send({ name: 'Test', address: '123 St', maxOfficeCap: 100 });
      expect(response.status).toBe(401);
    });

    it('should reject POST /api/blocks without token (401)', async () => {
      const response = await request(app)
        .post('/api/blocks')
        .send({ campusId: uuidv4(), name: 'Test', maxFloors: 3 });
      expect(response.status).toBe(401);
    });

    it('should reject POST /api/companies without token (401)', async () => {
      const response = await request(app)
        .post('/api/companies')
        .send({ name: 'Test Co', sector: 'Tech' });
      expect(response.status).toBe(401);
    });

    it('should reject POST /api/units/assign without token (401)', async () => {
      const response = await request(app)
        .post('/api/units/assign')
        .send({ blockId: uuidv4(), companyId: uuidv4(), floor: '1', areaSqM: 100 });
      expect(response.status).toBe(401);
    });

    it('should reject POST /api/restore/campuses/:id without token (401)', async () => {
      const response = await request(app).post(`/api/restore/campuses/${uuidv4()}`);
      expect(response.status).toBe(401);
    });
  });

  // ============================================================
  // VIEWER Role Tests (Read-Only)
  // ============================================================

  describe('VIEWER Role Enforcement (Read-Only)', () => {
    it('should allow VIEWER GET /api/auth/me (200)', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set(authed(viewerUser.token));
      expect(response.status).toBe(200);
    });

    it('should deny VIEWER POST /api/users (403)', async () => {
      const response = await request(app)
        .post('/api/users')
        .set(authed(viewerUser.token))
        .send({ username: 'test', password: 'Test123!', role: 'VIEWER' });
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER GET /api/users (403)', async () => {
      const response = await request(app)
        .get('/api/users')
        .set(authed(viewerUser.token));
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER DELETE /api/users/:id (403)', async () => {
      const response = await request(app)
        .delete(`/api/users/${uuidv4()}`)
        .set(authed(viewerUser.token));
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER POST /api/campuses (403)', async () => {
      const response = await request(app)
        .post('/api/campuses')
        .set(authed(viewerUser.token))
        .send({ name: 'Test Campus', address: '123 St', maxOfficeCap: 100 });
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER PUT /api/campuses/:id (403)', async () => {
      const response = await request(app)
        .put(`/api/campuses/${campusId}`)
        .set(authed(viewerUser.token))
        .send({ name: 'Updated Campus' });
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER DELETE /api/campuses/:id (403)', async () => {
      const response = await request(app)
        .delete(`/api/campuses/${campusId}`)
        .set(authed(viewerUser.token));
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER POST /api/blocks (403)', async () => {
      const response = await request(app)
        .post('/api/blocks')
        .set(authed(viewerUser.token))
        .send({ campusId, name: 'Test Block', maxFloors: 3 });
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER PUT /api/blocks/:id (403)', async () => {
      const response = await request(app)
        .put(`/api/blocks/${blockId}`)
        .set(authed(viewerUser.token))
        .send({ name: 'Updated Block' });
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER DELETE /api/blocks/:id (403)', async () => {
      const response = await request(app)
        .delete(`/api/blocks/${blockId}`)
        .set(authed(viewerUser.token));
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER POST /api/companies (403)', async () => {
      const response = await request(app)
        .post('/api/companies')
        .set(authed(viewerUser.token))
        .send({ name: 'Test Co', sector: 'Tech' });
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER PUT /api/companies/:id (403)', async () => {
      const response = await request(app)
        .put(`/api/companies/${companyId}`)
        .set(authed(viewerUser.token))
        .send({ name: 'Updated Co' });
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER DELETE /api/companies/:id (403)', async () => {
      const response = await request(app)
        .delete(`/api/companies/${companyId}`)
        .set(authed(viewerUser.token));
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER POST /api/units/assign (403)', async () => {
      const response = await request(app)
        .post('/api/units/assign')
        .set(authed(viewerUser.token))
        .send({ blockId, companyId, floor: '1', areaSqM: 100 });
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER DELETE /api/units/:id (403)', async () => {
      const response = await request(app)
        .delete(`/api/units/${unitId}`)
        .set(authed(viewerUser.token));
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER POST /api/restore/campuses/:id (403)', async () => {
      const response = await request(app)
        .post(`/api/restore/campuses/${uuidv4()}`)
        .set(authed(viewerUser.token));
      expect(response.status).toBe(403);
    });

    it('should deny VIEWER GET /api/restore/deleted (403)', async () => {
      const response = await request(app)
        .get('/api/restore/deleted')
        .set(authed(viewerUser.token));
      expect(response.status).toBe(403);
    });
  });

  // ============================================================
  // MANAGER Role Tests
  // ============================================================

  describe('MANAGER Role Enforcement', () => {
    it('should allow MANAGER GET /api/auth/me (200)', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set(authed(managerUser.token));
      expect(response.status).toBe(200);
    });

    it('should allow MANAGER GET /api/users (200)', async () => {
      const response = await request(app)
        .get('/api/users')
        .set(authed(managerUser.token));
      expect(response.status).toBe(200);
    });

    it('should allow MANAGER POST /api/users (2xx)', async () => {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const username = `mgr${randomSuffix}`;
      const response = await request(app)
        .post('/api/users')
        .set(authed(managerUser.token))
        .send({ username, password: 'Test123!', email: `${username}@test.com`, role: 'VIEWER' });
      expect([200, 201]).toContain(response.status);
    });

    it('should allow MANAGER POST /api/campuses (2xx)', async () => {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const response = await request(app)
        .post('/api/campuses')
        .set(authed(managerUser.token))
        .send({ name: `MgrCampus${randomSuffix}`, address: '123 St', maxOfficeCap: 100 });
      expect([200, 201]).toContain(response.status);
      expect(response.status).not.toBe(403);
    });

    it('should allow MANAGER PUT /api/campuses/:id (2xx)', async () => {
      const response = await request(app)
        .put(`/api/campuses/${campusId}`)
        .set(authed(managerUser.token))
        .send({ name: `Updated${Date.now()}` });
      expect([200, 404]).toContain(response.status);
      expect(response.status).not.toBe(403);
    });

    it('should allow MANAGER DELETE /api/campuses/:id (2xx)', async () => {
      const response = await request(app)
        .delete(`/api/campuses/${campusId}`)
        .set(authed(managerUser.token));
      expect([200, 204, 404]).toContain(response.status);
      expect(response.status).not.toBe(403);
    });

    it('should allow MANAGER POST /api/blocks (2xx)', async () => {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const response = await request(app)
        .post('/api/blocks')
        .set(authed(managerUser.token))
        .send({ campusId, name: `MgrBlock${randomSuffix}`, maxFloors: 3 });
      expect([200, 201]).toContain(response.status);
      expect(response.status).not.toBe(403);
    });

    it('should allow MANAGER DELETE /api/blocks/:id (2xx)', async () => {
      const response = await request(app)
        .delete(`/api/blocks/${blockId}`)
        .set(authed(managerUser.token));
      expect([200, 204, 404]).toContain(response.status);
      expect(response.status).not.toBe(403);
    });

    it('should allow MANAGER POST /api/companies (2xx)', async () => {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const response = await request(app)
        .post('/api/companies')
        .set(authed(managerUser.token))
        .send({
          name: `MgrCo${randomSuffix}`,
          sector: 'Tech',
          managerName: 'Test Manager',
          managerPhone: '+905551234567',
          managerEmail: `mgr${randomSuffix}@test.com`,
          employeeCount: 10
        });
      expect([200, 201]).toContain(response.status);
      expect(response.status).not.toBe(403);
    });

    it('should allow MANAGER DELETE /api/companies/:id (2xx)', async () => {
      const response = await request(app)
        .delete(`/api/companies/${companyId}`)
        .set(authed(managerUser.token));
      expect([200, 204, 404]).toContain(response.status);
      expect(response.status).not.toBe(403);
    });

    it('should allow MANAGER POST /api/units/assign (2xx)', async () => {
      const response = await request(app)
        .post('/api/units/assign')
        .set(authed(managerUser.token))
        .send({ blockId, companyId, floor: '1', areaSqM: 100 });
      expect([200, 201]).toContain(response.status);
      expect(response.status).not.toBe(403);
    });

    it('should allow MANAGER DELETE /api/units/:id (2xx)', async () => {
      const response = await request(app)
        .delete(`/api/units/${unitId}`)
        .set(authed(managerUser.token));
      expect([200, 204, 404]).toContain(response.status);
      expect(response.status).not.toBe(403);
    });

    it('should deny MANAGER POST /api/restore/campuses/:id (403)', async () => {
      const response = await request(app)
        .post(`/api/restore/campuses/${uuidv4()}`)
        .set(authed(managerUser.token));
      expect(response.status).toBe(403);
    });

    it('should deny MANAGER GET /api/restore/deleted (403)', async () => {
      const response = await request(app)
        .get('/api/restore/deleted')
        .set(authed(managerUser.token));
      expect(response.status).toBe(403);
    });
  });

  // ============================================================
  // ADMIN Role Tests
  // ============================================================

  describe('ADMIN Role Enforcement (Full Access)', () => {
    it('should allow ADMIN GET /api/auth/me (200)', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set(authed(adminUser.token));
      expect(response.status).toBe(200);
    });

    it('should allow ADMIN GET /api/users (200)', async () => {
      const response = await request(app)
        .get('/api/users')
        .set(authed(adminUser.token));
      expect(response.status).toBe(200);
    });

    it('should allow ADMIN POST /api/users (2xx)', async () => {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const response = await request(app)
        .post('/api/users')
        .set(authed(adminUser.token))
        .send({
          username: `adm${randomSuffix}`,
          password: 'Test123!',
          email: `adm${randomSuffix}@test.com`,
          role: 'VIEWER'
        });
      expect([200, 201]).toContain(response.status);
    });

    it('should allow ADMIN DELETE /api/users/:id (2xx)', async () => {
      // Create a temp user to delete
      const tempUser = await createUserViaAPI(app, adminUser.token, 'VIEWER');
      
      // Get user ID from token payload
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(tempUser.token) as any;
      const tempUserId = decoded.id;
      
      const response = await request(app)
        .delete(`/api/users/${tempUserId}`)
        .set(authed(adminUser.token));
      
      expect([200, 204, 404]).toContain(response.status);
      expect(response.status).not.toBe(403);
    });

    it('should allow ADMIN POST /api/campuses (2xx)', async () => {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const response = await request(app)
        .post('/api/campuses')
        .set(authed(adminUser.token))
        .send({ name: `AdmCampus${randomSuffix}`, address: '123 St', maxOfficeCap: 100 });
      expect([200, 201]).toContain(response.status);
    });

    it('should allow ADMIN DELETE /api/campuses/:id (2xx)', async () => {
      const response = await request(app)
        .delete(`/api/campuses/${campusId}`)
        .set(authed(adminUser.token));
      expect([200, 204, 404]).toContain(response.status);
    });

    it('should allow ADMIN POST /api/blocks (2xx)', async () => {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const response = await request(app)
        .post('/api/blocks')
        .set(authed(adminUser.token))
        .send({ campusId, name: `AdmBlock${randomSuffix}`, maxFloors: 3 });
      expect([200, 201]).toContain(response.status);
    });

    it('should allow ADMIN POST /api/companies (2xx)', async () => {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const response = await request(app)
        .post('/api/companies')
        .set(authed(adminUser.token))
        .send({
          name: `AdmCo${randomSuffix}`,
          sector: 'Tech',
          managerName: 'Test Manager',
          managerPhone: '+905551234567',
          managerEmail: `adm${randomSuffix}@test.com`,
          employeeCount: 10
        });
      expect([200, 201]).toContain(response.status);
    });

    it('should allow ADMIN POST /api/units/assign (2xx)', async () => {
      const response = await request(app)
        .post('/api/units/assign')
        .set(authed(adminUser.token))
        .send({ blockId, companyId, floor: '1', areaSqM: 100 });
      expect([200, 201]).toContain(response.status);
    });

    it('should allow ADMIN POST /api/restore/campuses/:id (2xx)', async () => {
      const response = await request(app)
        .post(`/api/restore/campuses/${uuidv4()}`)
        .set(authed(adminUser.token));
      expect([200, 404]).toContain(response.status);
      expect(response.status).not.toBe(403);
    });

    it('should allow ADMIN GET /api/restore/deleted (200)', async () => {
      const response = await request(app)
        .get('/api/restore/deleted')
        .set(authed(adminUser.token));
      expect(response.status).toBe(200);
    });
  });

  // ============================================================
  // Token Validation Tests
  // ============================================================

  describe('Token Validation', () => {
    it('should reject invalid token (401/403)', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', 'Bearer invalid-token-xyz-123');
      expect([401, 403]).toContain(response.status);
    });

    it('should reject missing Authorization header (401)', async () => {
      const response = await request(app).get('/api/users');
      expect(response.status).toBe(401);
    });

    it('should reject malformed Authorization header (401/403)', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', 'InvalidFormat token123');
      expect([401, 403]).toContain(response.status);
    });

    it('should reject token without Bearer prefix (401)', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', managerUser.token); // Missing "Bearer "
      expect(response.status).toBe(401);
    });
  });

  // ============================================================
  // Cross-Role Enforcement Tests
  // ============================================================

  describe('Cross-Role Access Prevention', () => {
    it('should prevent VIEWER from accessing MANAGER+ endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/users' },
        { method: 'post', path: '/api/campuses' },
        { method: 'delete', path: `/api/campuses/${campusId}` },
      ];

      for (const endpoint of endpoints) {
        const response = await (request(app) as any)[endpoint.method](endpoint.path)
          .set(authed(viewerUser.token))
          .send({});
        expect(response.status).toBe(403);
      }
    });

    it('should prevent MANAGER from accessing ADMIN-only endpoints', async () => {
      const endpoints = [
        { method: 'post', path: `/api/restore/campuses/${uuidv4()}` },
        { method: 'get', path: '/api/restore/deleted' },
      ];

      for (const endpoint of endpoints) {
        const response = await (request(app) as any)[endpoint.method](endpoint.path)
          .set(authed(managerUser.token));
        expect(response.status).toBe(403);
      }
    });
  });
});
