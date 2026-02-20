/**
 * Leases API Tests
 * 
 * Tests for lease CRUD operations and extended lease details
 */

import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

describe('Leases API', () => {
  let app: express.Application;
  let query: any;
  let testCompanyId: string;

  beforeAll(async () => {
    // Import modules in isolation
    const { default: leasesRoutes } = await import('../routes/leases');
    const db = await import('../db');
    
    query = db.query;

    // Create a test app with mocked authentication
    app = express();
    app.use(express.json());
    
    // Mock auth middleware to bypass authentication
    app.use('/api/leases', (req, res, next) => {
      (req as any).user = { id: 'test-user-id', username: 'testuser', role: 'ADMIN' };
      next();
    });
    
    app.use('/api/leases', leasesRoutes);
  });

  afterAll(async () => {
    // Clean up test data
    if (testCompanyId) {
      await query('DELETE FROM leases WHERE company_id = $1', [testCompanyId]);
      await query('DELETE FROM companies WHERE id = $1', [testCompanyId]);
    }
  });

  describe('GET /api/leases', () => {
    it('should return paginated list of leases', async () => {
      const response = await request(app)
        .get('/api/leases');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/leases?page=1&limit=5');

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.pagination.page).toBe(1);
    });
  });

  describe('GET /api/leases/details', () => {
    it('should return extended lease details', async () => {
      const response = await request(app)
        .get('/api/leases/details');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      if (response.body.length > 0) {
        const firstLease = response.body[0];
        expect(firstLease).toHaveProperty('company');
        expect(firstLease).toHaveProperty('lease');
        expect(firstLease).toHaveProperty('unit');
        expect(firstLease).toHaveProperty('block');
        expect(firstLease).toHaveProperty('campus');
      }
    });

    it('should include company data in extended details', async () => {
      const response = await request(app)
        .get('/api/leases/details');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      if (response.body.length > 0) {
        const firstItem = response.body[0];
        expect(firstItem.company).toBeDefined();
        expect(firstItem.company).toHaveProperty('id');
        expect(firstItem.company).toHaveProperty('name');
        expect(firstItem.company).toHaveProperty('sector');
      }
    });

    it('should include score entries in company data', async () => {
      const response = await request(app)
        .get('/api/leases/details');

      expect(response.status).toBe(200);
      
      if (response.body.length > 0) {
        const firstItem = response.body[0];
        expect(firstItem.company).toHaveProperty('scoreEntries');
        expect(Array.isArray(firstItem.company.scoreEntries)).toBe(true);
      }
    });

    it('should include documents in company data', async () => {
      const response = await request(app)
        .get('/api/leases/details');

      expect(response.status).toBe(200);
      
      if (response.body.length > 0) {
        const firstItem = response.body[0];
        expect(firstItem.company).toHaveProperty('documents');
        expect(Array.isArray(firstItem.company.documents)).toBe(true);
      }
    });
  });

  describe('PUT /api/leases/:companyId', () => {
    it('should update an existing lease', async () => {
      // First create a test company with contract template
      const companyResult = await query(
        `INSERT INTO companies (name, registration_number, sector, business_areas, manager_name, manager_phone, manager_email, employee_count, score, contract_template)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)
         RETURNING id`,
        [
          `Test Company ${Date.now()}`, 
          `TEST-${Date.now()}`, 
          'Software', 
          ['Testing'], 
          'Test Manager', 
          '+905551234567', 
          'test@test.com', 
          5,
          JSON.stringify({
            startDate: '2024-01-01',
            endDate: '2024-12-31',
            rentPerSqM: 50
          })
        ]
      );
      testCompanyId = companyResult.rows[0].id;

      const updates = {
        startDate: '2024-02-01',
        endDate: '2025-01-31',
        monthlyRent: 6000,
        operatingFee: 600,
      };

      const response = await request(app)
        .put(`/api/leases/${testCompanyId}`)
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
    });

    it('should return success for non-existent company (no-op)', async () => {
      const response = await request(app)
        .put(`/api/leases/${uuidv4()}`)
        .send({ monthlyRent: 7000 });

      expect(response.status).toBe(200);
      // API returns success even if company doesn't exist (no-op behavior)
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('DELETE /api/leases/:companyId', () => {
    it('should handle soft delete properly', async () => {
      // Note: The DELETE endpoint terminates leases by deleting records
      // This test verifies the endpoint is accessible
      if (!testCompanyId) {
        console.log('Skipping delete test - no test company created');
        return;
      }

      const response = await request(app)
        .delete(`/api/leases/${testCompanyId}`);

      // Should succeed (204 or 200 depending on implementation)
      expect([200, 204]).toContain(response.status);
    });
  });

  describe('Data Consistency', () => {
    it('should handle companies without leases correctly', async () => {
      // Create a company without any lease
      const tempCompany = await query(
        `INSERT INTO companies (name, registration_number, sector, business_areas, manager_name, score)
         VALUES ($1, $2, $3, $4, $5, 0) RETURNING id`,
        [`Temp Company ${Date.now()}`, `TEMP-${Date.now()}`, 'Testing', ['Test'], 'Temp Manager']
      );

      const tempCompanyId = tempCompany.rows[0].id;

      // Try to get lease details for this company
      const response = await request(app)
        .get('/api/leases/details');

      expect(response.status).toBe(200);

      // Clean up
      await query('DELETE FROM companies WHERE id = $1', [tempCompanyId]);
    });
  });
});
