import request from 'supertest';
import { app } from '../../src/app';

describe('Express App', () => {
  describe('GET /health', () => {
    it('should return 200 with healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy' });
    });

    it('should return Content-Type application/json', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('API routes registration', () => {
    it('should have /api/v1/validate/address route', async () => {
      const response = await request(app)
        .post('/api/v1/validate/address')
        .send({});

      // 400 means route exists and validates missing fields
      expect(response.status).toBe(400);
    });

    it('should have /api/v1/validate/zipcode-city route', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({});

      // 400 means route exists and validates invalid/missing zipcode format
      expect(response.status).toBe(400);
    });

    it('should have /api/v1/validate/parse route', async () => {
      const response = await request(app)
        .post('/api/v1/validate/parse')
        .send({});

      // 400 means route exists and validates missing raw_address field
      expect(response.status).toBe(400);
    });

    it('should have /api/v1/validate/bulk route', async () => {
      const response = await request(app)
        .post('/api/v1/validate/bulk')
        .attach('file', Buffer.from('test'), 'test.xlsx');

      // Route exists - returns 200 (processed) or 400 (validation error)
      // With an invalid Excel buffer, the xlsx parser may still produce empty results
      expect([200, 400]).toContain(response.status);
    });
  });

  describe('JSON body parsing middleware', () => {
    it('should parse JSON request bodies', async () => {
      const response = await request(app)
        .post('/api/v1/validate/address')
        .set('Content-Type', 'application/json')
        .send({ street_line_1: '123 Main St' });

      // Route exists and can receive JSON (returns 400 for missing fields)
      expect(response.status).toBe(400);
    });
  });

  describe('Unknown routes', () => {
    it('should return 404 for unregistered routes', async () => {
      const response = await request(app).get('/nonexistent');

      expect(response.status).toBe(404);
    });
  });
});
