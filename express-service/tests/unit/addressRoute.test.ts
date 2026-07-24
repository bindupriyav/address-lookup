import request from 'supertest';
import { app } from '../../src/app';

describe('POST /api/v1/validate/address', () => {
  describe('Missing fields validation', () => {
    it('should return 400 with MISSING_FIELDS when body is empty', async () => {
      const response = await request(app)
        .post('/api/v1/validate/address')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('MISSING_FIELDS');
      expect(response.body.detail.fields).toEqual(
        expect.arrayContaining(['street_line_1', 'city', 'state', 'zipcode'])
      );
    });

    it('should return 400 listing only the missing fields', async () => {
      const response = await request(app)
        .post('/api/v1/validate/address')
        .send({ street_line_1: '123 Main St', city: 'Springfield' });

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('MISSING_FIELDS');
      expect(response.body.detail.fields).toEqual(
        expect.arrayContaining(['state', 'zipcode'])
      );
      expect(response.body.detail.fields).not.toContain('street_line_1');
      expect(response.body.detail.fields).not.toContain('city');
    });

    it('should treat empty string fields as missing', async () => {
      const response = await request(app)
        .post('/api/v1/validate/address')
        .send({
          street_line_1: '  ',
          city: '',
          state: 'IL',
          zipcode: '62701',
        });

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('MISSING_FIELDS');
      expect(response.body.detail.fields).toEqual(
        expect.arrayContaining(['street_line_1', 'city'])
      );
    });

    it('should include a human-readable message', async () => {
      const response = await request(app)
        .post('/api/v1/validate/address')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.detail.message).toContain('Missing required fields');
    });
  });

  describe('Successful validation', () => {
    it('should return 200 with ValidationResult for a valid address', async () => {
      const response = await request(app)
        .post('/api/v1/validate/address')
        .send({
          street_line_1: '1600 Pennsylvania Ave',
          city: 'Washington',
          state: 'DC',
          zipcode: '20500',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('original_address');
      expect(response.body).toHaveProperty('status');
      expect(response.body.original_address.street_line_1).toBe('1600 Pennsylvania Ave');
      expect(response.body.original_address.city).toBe('Washington');
      expect(response.body.original_address.state).toBe('DC');
      expect(response.body.original_address.zipcode).toBe('20500');
    });

    it('should return status "valid" with standardized_address for a known valid address', async () => {
      const response = await request(app)
        .post('/api/v1/validate/address')
        .send({
          street_line_1: '1600 Pennsylvania Ave',
          city: 'Washington',
          state: 'DC',
          zipcode: '20500',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('valid');
      expect(response.body.standardized_address).toBeDefined();
    });

    it('should return status "invalid" for an address with INVALID keyword', async () => {
      const response = await request(app)
        .post('/api/v1/validate/address')
        .send({
          street_line_1: 'INVALID Street',
          city: 'Nowhere',
          state: 'XX',
          zipcode: '00000',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('invalid');
      expect(response.body.error_message).toBeDefined();
    });

    it('should accept optional street_line_2', async () => {
      const response = await request(app)
        .post('/api/v1/validate/address')
        .send({
          street_line_1: '123 Main St',
          street_line_2: 'Apt 4B',
          city: 'Anytown',
          state: 'NY',
          zipcode: '12345',
        });

      expect(response.status).toBe(200);
      expect(response.body.original_address.street_line_2).toBe('Apt 4B');
    });
  });
});
