/**
 * Campuses API Tests
 *
 * Tests for campus management operations
 */

import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db';
import campusesRoutes from '../routes/campuses';

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

const app = express();
app.use(express.json());

// Mock authentication
app.use((req: any, res, next) => {
  req.user = { id: 'test-user-id', username: 'testuser', role: 'ADMIN' };
  next();
});

app.use('/api/campuses', campusesRoutes);

describe('Campuses API', () => {
  let testCampusId: string;

  afterAll(async () => {
    await query('DELETE FROM campuses WHERE id = $1', [testCampusId]);
  });

  describe('GET /api/campuses', () => {
    it('should return list of campuses', async () => {
      const response = await request(app)
        .get('/api/campuses')
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/campuses', () => {
    it('should create a new campus', async () => {
      const campusData = {
        name: 'Test Campus ' + Date.now(),
        address: 'Test Address'
      };

      const response = await request(app)
        .post('/api/campuses')
        .send(campusData)
        .expect('Content-Type', /json/);

      if (response.status !== 201) {
        console.log('Error response:', response.body);
      }
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(campusData.name);
      testCampusId = response.body.id;
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/campuses')
        .send({ address: 'No Name' });

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/campuses/:id', () => {
    it('should update an existing campus', async () => {
      const response = await request(app)
        .put(`/api/campuses/${testCampusId}`)
        .send({ name: 'Updated Campus Name' })
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Campus Name');
    });

    it('should return 404 for non-existent campus', async () => {
      const response = await request(app)
        .put(`/api/campuses/${uuidv4()}`)
        .send({ name: 'Test' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/campuses/:id', () => {
    it('should soft delete a campus', async () => {
      // Create campus to delete
      const result = await query(
        'INSERT INTO campuses (id, name, address) VALUES ($1, $2, $3) RETURNING id',
        [uuidv4(), 'Delete Me', 'Test']
      );
      const campusId = result.rows[0].id;

      const response = await request(app)
        .delete(`/api/campuses/${campusId}`);

      expect(response.status).toBe(204);

      // Verify soft delete
      const check = await query('SELECT deleted_at FROM campuses WHERE id = $1', [campusId]);
      expect(check.rows[0].deleted_at).not.toBeNull();
    });
  });
});
