import request from 'supertest';
import { app } from '../../src/app';

describe('POST /api/v1/validate/parse - Integration', () => {
  it('should return 200 with parse result for a raw address', async () => {
    // The LLM service is not running, so this will return either
    // service_unavailable or parse_failed status
    const response = await request(app)
      .post('/api/v1/validate/parse')
      .send({
        raw_address: '1600 Pennsylvania Ave NW, Washington, DC 20500',
      })
      .expect(200);

    expect(response.body.raw_text).toBe('1600 Pennsylvania Ave NW, Washington, DC 20500');
    // Without an actual LLM service, expect service_unavailable or parse_failed
    expect(['service_unavailable', 'parse_failed']).toContain(response.body.status);
  });

  it('should return 400 when raw_address is missing', async () => {
    const response = await request(app)
      .post('/api/v1/validate/parse')
      .send({})
      .expect(400);

    expect(response.body.detail.error_code).toBe('VALIDATION_ERROR');
    expect(response.body.detail.message).toContain('raw_address');
  });

  it('should return 400 when raw_address is not a string', async () => {
    const response = await request(app)
      .post('/api/v1/validate/parse')
      .send({ raw_address: 12345 })
      .expect(400);

    expect(response.body.detail.error_code).toBe('VALIDATION_ERROR');
  });

  it('should include raw_text in the response body', async () => {
    const rawAddress = '456 Elm Street, Boston MA 02101';
    const response = await request(app)
      .post('/api/v1/validate/parse')
      .send({ raw_address: rawAddress })
      .expect(200);

    expect(response.body.raw_text).toBe(rawAddress);
    expect(response.body.status).toBeDefined();
  });
});
