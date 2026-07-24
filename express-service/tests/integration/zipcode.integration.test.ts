import request from 'supertest';
import { app } from '../../src/app';

describe('POST /api/v1/validate/zipcode-city - Integration', () => {
  it('should return 200 with match status for valid zipcode-city pair', async () => {
    const response = await request(app)
      .post('/api/v1/validate/zipcode-city')
      .send({
        zipcode: '20500',
        city: 'Washington',
      })
      .expect(200);

    expect(response.body.status).toBe('match');
    expect(response.body.zipcode).toBe('20500');
    expect(response.body.city).toBe('WASHINGTON');
  });

  it('should return 200 with mismatch status and valid_cities for wrong city', async () => {
    const response = await request(app)
      .post('/api/v1/validate/zipcode-city')
      .send({
        zipcode: '20500',
        city: 'New York',
      })
      .expect(200);

    expect(response.body.status).toBe('mismatch');
    expect(response.body.valid_cities).toBeDefined();
    expect(Array.isArray(response.body.valid_cities)).toBe(true);
    expect(response.body.valid_cities).toContain('WASHINGTON');
  });

  it('should return 400 for invalid zipcode format (letters)', async () => {
    const response = await request(app)
      .post('/api/v1/validate/zipcode-city')
      .send({
        zipcode: 'ABCDE',
        city: 'Springfield',
      })
      .expect(400);

    expect(response.body.detail.error_code).toBe('INVALID_ZIPCODE_FORMAT');
  });

  it('should return 400 for invalid zipcode format (too short)', async () => {
    const response = await request(app)
      .post('/api/v1/validate/zipcode-city')
      .send({
        zipcode: '123',
        city: 'Springfield',
      })
      .expect(400);

    expect(response.body.detail.error_code).toBe('INVALID_ZIPCODE_FORMAT');
  });

  it('should return 400 when zipcode is missing', async () => {
    const response = await request(app)
      .post('/api/v1/validate/zipcode-city')
      .send({
        city: 'Springfield',
      })
      .expect(400);

    expect(response.body.detail.error_code).toBe('INVALID_ZIPCODE_FORMAT');
  });

  it('should accept 5+4 zipcode format', async () => {
    const response = await request(app)
      .post('/api/v1/validate/zipcode-city')
      .send({
        zipcode: '20500-0001',
        city: 'Washington',
      })
      .expect(200);

    expect(response.body.status).toBe('match');
    expect(response.body.zipcode).toBe('20500-0001');
  });
});
