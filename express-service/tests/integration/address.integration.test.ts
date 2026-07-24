import request from 'supertest';
import { app } from '../../src/app';

describe('POST /api/v1/validate/address - Integration', () => {
  it('should return 200 with valid status for a valid address', async () => {
    const response = await request(app)
      .post('/api/v1/validate/address')
      .send({
        street_line_1: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipcode: '62701',
      })
      .expect(200);

    expect(response.body.status).toBe('valid');
    expect(response.body.original_address).toBeDefined();
    expect(response.body.standardized_address).toBeDefined();
    expect(response.body.standardized_address.street_line_1).toBe('123 MAIN ST');
    expect(response.body.standardized_address.city).toBe('SPRINGFIELD');
    expect(response.body.standardized_address.state).toBe('IL');
  });

  it('should return 400 with MISSING_FIELDS when required fields are absent', async () => {
    const response = await request(app)
      .post('/api/v1/validate/address')
      .send({
        street_line_1: '123 Main St',
        // city, state, zipcode missing
      })
      .expect(400);

    expect(response.body.detail.error_code).toBe('MISSING_FIELDS');
    expect(response.body.detail.fields).toContain('city');
    expect(response.body.detail.fields).toContain('state');
    expect(response.body.detail.fields).toContain('zipcode');
  });

  it('should return 400 when street_line_1 is empty string', async () => {
    const response = await request(app)
      .post('/api/v1/validate/address')
      .send({
        street_line_1: '',
        city: 'Springfield',
        state: 'IL',
        zipcode: '62701',
      })
      .expect(400);

    expect(response.body.detail.error_code).toBe('MISSING_FIELDS');
    expect(response.body.detail.fields).toContain('street_line_1');
  });

  it('should return 200 with invalid status when INVALID keyword in street_line_1', async () => {
    const response = await request(app)
      .post('/api/v1/validate/address')
      .send({
        street_line_1: '999 INVALID Road',
        city: 'Nowhere',
        state: 'CA',
        zipcode: '00000',
      })
      .expect(200);

    expect(response.body.status).toBe('invalid');
    expect(response.body.error_message).toBeDefined();
    expect(response.body.standardized_address).toBeUndefined();
  });

  it('should return 200 with standardized address for known address', async () => {
    const response = await request(app)
      .post('/api/v1/validate/address')
      .send({
        street_line_1: '1600 Pennsylvania Ave NW',
        city: 'Washington',
        state: 'DC',
        zipcode: '20500',
      })
      .expect(200);

    expect(response.body.status).toBe('valid');
    expect(response.body.standardized_address.street_line_1).toBe('1600 PENNSYLVANIA AVE NW');
    expect(response.body.standardized_address.city).toBe('WASHINGTON');
    expect(response.body.standardized_address.state).toBe('DC');
    expect(response.body.standardized_address.zipcode).toBe('20500');
  });
});
