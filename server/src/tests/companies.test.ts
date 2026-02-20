/**
 * Companies API Tests
 * 
 * Tests for company CRUD operations
 */

import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

describe('Companies API', () => {
  let app: express.Application;
  let query: any;
  let testCompanyId: string;

  // Use jest.isolateModules to get fresh module copies with proper mocking
  beforeAll(async () => {
    // Import modules in isolation
    const { default: companiesRoutes } = await import('../routes/companies');
    const db = await import('../db');
    
    query = db.query;

    // Create a test app with mocked middleware
    app = express();
    app.use(express.json());
    
    // Mock auth middleware to bypass authentication
    app.use('/api/companies', (req, res, next) => {
      (req as any).user = { id: 'test-user-id', username: 'testuser', role: 'ADMIN' };
      next();
    });
    
    app.use('/api/companies', companiesRoutes);
  });

  afterAll(async () => {
    // Clean up test data
    if (testCompanyId && query) {
      await query('DELETE FROM companies WHERE id = $1', [testCompanyId]);
    }
  });

  describe('GET /api/companies', () => {
    it('should return paginated list of companies', async () => {
      const response = await request(app)
        .get('/api/companies');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/companies?page=1&limit=5');

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.pagination.page).toBe(1);
    });
  });

  describe('POST /api/companies', () => {
    it('should create a new company', async () => {
      const newCompany = {
        name: `Test Company ${Date.now()}`,
        registrationNumber: `TEST-${Date.now()}`,
        sector: 'Software',
        businessAreas: ['Web Development', 'Mobile Apps'],
        managerName: 'Test Manager',
        managerPhone: '+905551234567',
        managerEmail: 'test@test.com',
        employeeCount: 10,
      };

      const response = await request(app)
        .post('/api/companies')
        .send(newCompany);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(newCompany.name);
      // POST returns raw DB row with snake_case
      expect(response.body.manager_name).toBe(newCompany.managerName);
      
      testCompanyId = response.body.id;
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/companies')
        .send({
          name: 'A', // Too short
        });

      expect(response.status).toBe(400);
    });

    it('should validate phone number format', async () => {
      const response = await request(app)
        .post('/api/companies')
        .send({
          name: 'Test Company',
          managerPhone: 'invalid-phone',
        });

      expect(response.status).toBe(400);
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/companies')
        .send({
          name: 'Test Company',
          managerEmail: 'invalid-email',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/companies/:id', () => {
    it('should update an existing company', async () => {
      if (!testCompanyId) {
        console.log('Skipping update test - no test company created');
        return;
      }

      const updates = {
        name: 'Updated Test Company',
        employeeCount: 15,
      };

      const response = await request(app)
        .put(`/api/companies/${testCompanyId}`)
        .send(updates);

      expect(response.status).toBe(200);
    });

    it('should return 404 for non-existent company', async () => {
      const response = await request(app)
        .put(`/api/companies/${uuidv4()}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/companies/:id', () => {
    it('should soft delete a company', async () => {
      if (!testCompanyId) {
        console.log('Skipping delete test - no test company created');
        return;
      }

      const response = await request(app)
        .delete(`/api/companies/${testCompanyId}`);

      expect(response.status).toBe(204);

      // Verify soft delete - company should still exist but with deleted_at set
      const checkResult = await query('SELECT * FROM companies WHERE id = $1', [testCompanyId]);
      expect(checkResult.rows.length).toBe(1);
      expect(checkResult.rows[0].deleted_at).not.toBeNull();
    });
  });

  describe('Score Entries', () => {
    it('should add a score entry to a company', async () => {
      // Create a new company for score testing since previous one was deleted
      const newCompany = {
        name: `Score Test Company ${Date.now()}`,
        registrationNumber: `SCORE-TEST-${Date.now()}`,
        sector: 'Software',
        businessAreas: ['Testing'],
        managerName: 'Score Test Manager',
        managerPhone: '+905551234567',
        managerEmail: 'scoretest@test.com',
        employeeCount: 5,
      };

      const createResponse = await request(app)
        .post('/api/companies')
        .send(newCompany);

      const companyId = createResponse.body.id;

      const scoreEntry = {
        type: 'TUBITAK',
        description: 'Test TUBITAK project',
        points: 10,
      };

      const response = await request(app)
        .post(`/api/companies/${companyId}/scores`)
        .send(scoreEntry);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      // Database returns DECIMAL as string
      expect(parseFloat(response.body.points)).toBe(10);

      // Clean up
      await query('DELETE FROM companies WHERE id = $1', [companyId]);
    });
  });
});
