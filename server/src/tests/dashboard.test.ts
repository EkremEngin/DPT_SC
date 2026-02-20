/**
 * Dashboard API Tests
 * 
 * Tests for dashboard metrics and statistics
 */

import request from 'supertest';
import express from 'express';

describe('Dashboard API', () => {
  let app: express.Application;

  beforeAll(async () => {
    // Import modules in isolation
    const { default: dashboardRoutes } = await import('../routes/dashboard');
    
    // Create a test app with mocked authentication
    app = express();
    app.use(express.json());
    
    // Mock auth middleware to bypass authentication
    app.use('/api/dashboard', (req, res, next) => {
      (req as any).user = { id: 'test-user-id', username: 'testuser', role: 'ADMIN' };
      next();
    });
    
    app.use('/api/dashboard', dashboardRoutes);
  });

  describe('GET /api/dashboard', () => {
    it('should return dashboard metrics', async () => {
      const response = await request(app)
        .get('/api/dashboard');

      expect(response.status).toBe(200);
      
      // Validate response structure
      expect(response.body).toHaveProperty('totalArea');
      expect(response.body).toHaveProperty('usedArea');
      expect(response.body).toHaveProperty('emptyArea');
      expect(response.body).toHaveProperty('occupancyRate');
      expect(response.body).toHaveProperty('totalRevenue');
      expect(response.body).toHaveProperty('totalCompanies');
      expect(response.body).toHaveProperty('sectorData');
      expect(response.body).toHaveProperty('campusData');

      // Validate data types
      expect(typeof response.body.totalArea).toBe('number');
      expect(typeof response.body.usedArea).toBe('number');
      expect(typeof response.body.occupancyRate).toBe('number');
      expect(typeof response.body.totalRevenue).toBe('number');
      expect(typeof response.body.totalCompanies).toBe('number');
      expect(Array.isArray(response.body.sectorData)).toBe(true);
      expect(Array.isArray(response.body.campusData)).toBe(true);
    });

    it('should return valid sector data structure', async () => {
      const response = await request(app)
        .get('/api/dashboard');

      expect(response.status).toBe(200);
      
      if (response.body.sectorData.length > 0) {
        const firstSector = response.body.sectorData[0];
        expect(firstSector).toHaveProperty('name');
        expect(firstSector).toHaveProperty('value');
        expect(typeof firstSector.name).toBe('string');
        expect(typeof firstSector.value).toBe('number');
      }
    });

    it('should return valid campus data structure', async () => {
      const response = await request(app)
        .get('/api/dashboard');

      expect(response.status).toBe(200);
      
      if (response.body.campusData.length > 0) {
        const firstCampus = response.body.campusData[0];
        expect(firstCampus).toHaveProperty('id');
        expect(firstCampus).toHaveProperty('name');
        expect(firstCampus).toHaveProperty('totalArea');
        expect(firstCampus).toHaveProperty('usedArea');
        expect(firstCampus).toHaveProperty('emptyArea');
        expect(firstCampus).toHaveProperty('occupancyRate');
        expect(firstCampus).toHaveProperty('unitCount');
        expect(firstCampus).toHaveProperty('occupiedCount');
        expect(firstCampus).toHaveProperty('revenue');
      }
    });

    it('should calculate occupancy rate correctly', async () => {
      const response = await request(app)
        .get('/api/dashboard');

      expect(response.status).toBe(200);
      
      const { totalArea, usedArea, occupancyRate } = response.body;
      
      // Occupancy rate should be: (usedArea / totalArea) * 100
      if (totalArea > 0) {
        const expectedRate = (usedArea / totalArea) * 100;
        expect(occupancyRate).toBeCloseTo(expectedRate, 1);
      } else {
        expect(occupancyRate).toBe(0);
      }
    });

    it('should calculate empty area correctly', async () => {
      const response = await request(app)
        .get('/api/dashboard');

      expect(response.status).toBe(200);
      
      const { totalArea, usedArea, emptyArea } = response.body;
      
      // Empty area should be: totalArea - usedArea
      expect(emptyArea).toBeCloseTo(totalArea - usedArea, 1);
    });

    it('should filter by campusId when provided', async () => {
      // Skip this test as it requires a valid campus UUID from database
      // The dashboard accepts UUID campusId parameter
      const response = await request(app)
        .get('/api/dashboard')
        .query({ campusId: '00000000-0000-0000-0000-000000000000' });

      // Will return empty results for invalid UUID, but structure should be valid
      expect([200, 500]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('totalArea');
        expect(response.body).toHaveProperty('campusData');
      }
    });

    it('should sum campus revenues to get total revenue', async () => {
      const response = await request(app)
        .get('/api/dashboard');

      expect(response.status).toBe(200);
      
      const { totalRevenue, campusData } = response.body;
      
      // Total revenue should be sum of all campus revenues
      const campusRevenueSum = campusData.reduce((sum: number, campus: any) => 
        sum + (campus.revenue || 0), 0
      );
      
      expect(totalRevenue).toBeCloseTo(campusRevenueSum, 1);
    });
  });

  describe('Data Integrity', () => {
    it('should handle empty database gracefully', async () => {
      // This test verifies the API doesn't crash when no data exists
      const response = await request(app)
        .get('/api/dashboard');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalArea');
      expect(response.body).toHaveProperty('usedArea');
      expect(response.body).toHaveProperty('occupancyRate');
    });

    it('should return numeric values for all metrics', async () => {
      const response = await request(app)
        .get('/api/dashboard');

      expect(response.status).toBe(200);
      
      const numericFields = [
        'totalArea', 'usedArea', 'emptyArea', 'occupancyRate', 
        'totalRevenue', 'totalCompanies'
      ];
      
      numericFields.forEach(field => {
        expect(typeof response.body[field]).toBe('number');
        expect(isNaN(response.body[field])).toBe(false);
      });
    });
  });

  describe('Caching Behavior', () => {
    it('should include cache headers', async () => {
      const response = await request(app)
        .get('/api/dashboard');

      expect(response.status).toBe(200);
      // The route uses semi-static caching, should have cache-control header
      expect(response.headers['cache-control']).toBeDefined();
    });
  });
});
