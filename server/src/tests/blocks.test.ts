/**
 * Blocks API Tests
 *
 * Tests for block management operations
 */

import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db';
import blocksRoutes from '../routes/blocks';
import campusesRoutes from '../routes/campuses';

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

const app = express();
app.use(express.json());

// Mock authentication
app.use((req: any, res, next) => {
  req.user = {
    id: 'test-user-id',
    username: 'testuser',
    role: 'ADMIN'
  };
  next();
});

app.use('/api/campuses', campusesRoutes);
app.use('/api/blocks', blocksRoutes);

describe('Blocks API', () => {
  let testCampusId: string;
  let testBlockId: string;
  let accessToken: string;

  beforeAll(async () => {
    // Create a test campus
    const campusResult = await query(
      'INSERT INTO campuses (id, name, address) VALUES ($1, $2, $3) RETURNING id',
      [uuidv4(), 'Test Campus', 'Test Address']
    );
    testCampusId = campusResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await query('DELETE FROM blocks WHERE campus_id = $1', [testCampusId]);
    await query('DELETE FROM campuses WHERE id = $1', [testCampusId]);
  });

  describe('GET /api/blocks', () => {
    it('should return list of blocks', async () => {
      const response = await request(app)
        .get('/api/blocks')
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should filter by campus_id', async () => {
      const response = await request(app)
        .get(`/api/blocks?campus_id=${testCampusId}`)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/blocks', () => {
    it('should create a new block', async () => {
      const blockData = {
        campusId: testCampusId,
        name: 'Test Block',
        floorCapacities: [
          { floor: '1', totalSqM: 100 },
          { floor: '2', totalSqM: 120 }
        ],
        sqMPerEmployee: 10
      };

      const response = await request(app)
        .post('/api/blocks')
        .send(blockData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Block');
      testBlockId = response.body.id;
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/blocks')
        .send({ name: 'Invalid Block' }) // Missing campusId

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/blocks/:id', () => {
    it('should update an existing block', async () => {
      const response = await request(app)
        .put(`/api/blocks/${testBlockId}`)
        .send({
          name: 'Updated Block Name'
        })
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Block Name');
    });

    it('should return 404 for non-existent block', async () => {
      const response = await request(app)
        .put(`/api/blocks/${uuidv4()}`)
        .send({ name: 'Test' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/blocks/:id', () => {
    it('should soft delete a block', async () => {
      // Create a block to delete
      const createResult = await query(
        'INSERT INTO blocks (id, campus_id, name) VALUES ($1, $2, $3) RETURNING id',
        [uuidv4(), testCampusId, 'To Be Deleted']
      );
      const blockToDelete = createResult.rows[0].id;

      const response = await request(app)
        .delete(`/api/blocks/${blockToDelete}`);

      expect(response.status).toBe(204);

      // Verify soft delete
      const checkResult = await query(
        'SELECT deleted_at FROM blocks WHERE id = $1',
        [blockToDelete]
      );
      expect(checkResult.rows[0].deleted_at).not.toBeNull();
    });
  });
});
