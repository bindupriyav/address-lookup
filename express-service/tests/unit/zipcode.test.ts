import request from 'supertest';
import { app } from '../../src/app';

describe('POST /api/v1/validate/zipcode-city', () => {
  describe('zipcode format validation', () => {
    it('should return 400 for missing zipcode', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ city: 'Washington' });

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('INVALID_ZIPCODE_FORMAT');
    });

    it('should return 400 for empty zipcode', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ zipcode: '', city: 'Washington' });

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('INVALID_ZIPCODE_FORMAT');
    });

    it('should return 400 for zipcode with letters', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ zipcode: '2050A', city: 'Washington' });

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('INVALID_ZIPCODE_FORMAT');
    });

    it('should return 400 for zipcode with fewer than 5 digits', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ zipcode: '2050', city: 'Washington' });

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('INVALID_ZIPCODE_FORMAT');
    });

    it('should return 400 for zipcode with more than 5 digits without hyphen', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ zipcode: '205001', city: 'Washington' });

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('INVALID_ZIPCODE_FORMAT');
    });

    it('should return 400 for 5+4 format with wrong separator', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ zipcode: '20500.0001', city: 'Washington' });

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('INVALID_ZIPCODE_FORMAT');
    });

    it('should return 400 for 5+4 format with incomplete extension', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ zipcode: '20500-01', city: 'Washington' });

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('INVALID_ZIPCODE_FORMAT');
    });
  });

  describe('successful verification - match', () => {
    it('should return match for valid zipcode-city pair (5-digit)', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ zipcode: '20500', city: 'Washington' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('match');
      expect(response.body.zipcode).toBe('20500');
      expect(response.body.city).toBe('WASHINGTON');
    });

    it('should return match for valid zipcode-city pair (5+4 format)', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ zipcode: '20500-0001', city: 'Washington' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('match');
      expect(response.body.zipcode).toBe('20500-0001');
      expect(response.body.city).toBe('WASHINGTON');
    });
  });

  describe('successful verification - mismatch', () => {
    it('should return mismatch with valid_cities for wrong city', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ zipcode: '20500', city: 'New York' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('mismatch');
      expect(response.body.zipcode).toBe('20500');
      expect(response.body.valid_cities).toContain('WASHINGTON');
    });
  });

  describe('missing city', () => {
    it('should return 400 when city is missing', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ zipcode: '20500' });

      expect(response.status).toBe(400);
    });

    it('should return 400 when city is empty', async () => {
      const response = await request(app)
        .post('/api/v1/validate/zipcode-city')
        .send({ zipcode: '20500', city: '' });

      expect(response.status).toBe(400);
    });
  });
});
