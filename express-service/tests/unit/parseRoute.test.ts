import request from 'supertest';
import express from 'express';
import { createParseRouter } from '../../src/routes/parse';
import { AddressValidator } from '../../src/services/addressValidator';
import { LLMParser, LLMTimeoutError, LLMParseError } from '../../src/parsers/llmParser';
import { USPSAdapter } from '../../src/adapters/uspsAdapter';
import { StructuredAddress } from '../../src/models/address';
import { ValidationResult } from '../../src/models/validation';

describe('POST /validate/parse', () => {
  let app: express.Express;
  let mockUspsAdapter: jest.Mocked<USPSAdapter>;
  let addressValidator: AddressValidator;
  let llmParser: LLMParser;

  beforeEach(() => {
    mockUspsAdapter = {
      validateAddress: jest.fn(),
      verifyZipcodeCity: jest.fn(),
    };
    addressValidator = new AddressValidator(mockUspsAdapter);
    llmParser = new LLMParser('http://fake-llm:8081/parse-address');

    app = express();
    app.use(express.json());
    app.use('/api/v1', createParseRouter(addressValidator, llmParser));
  });

  it('should return 400 when raw_address is missing', async () => {
    const res = await request(app)
      .post('/api/v1/validate/parse')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.detail.error_code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when raw_address is not a string', async () => {
    const res = await request(app)
      .post('/api/v1/validate/parse')
      .send({ raw_address: 123 });

    expect(res.status).toBe(400);
    expect(res.body.detail.error_code).toBe('VALIDATION_ERROR');
  });

  it('should return parse_failed when LLM cannot parse the address', async () => {
    jest.spyOn(llmParser, 'parse').mockRejectedValue(
      new LLMParseError('garbled text', 'Failed to parse address')
    );

    const res = await request(app)
      .post('/api/v1/validate/parse')
      .send({ raw_address: 'garbled text' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('parse_failed');
    expect(res.body.raw_text).toBe('garbled text');
    expect(res.body.parsed_address).toBeUndefined();
    expect(res.body.validation_result).toBeUndefined();
    expect(res.body.error_message).toContain('Failed to parse address');
  });

  it('should return service_unavailable when LLM times out', async () => {
    jest.spyOn(llmParser, 'parse').mockRejectedValue(
      new LLMTimeoutError(10000)
    );

    const res = await request(app)
      .post('/api/v1/validate/parse')
      .send({ raw_address: '1600 Pennsylvania Ave NW Washington DC' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('service_unavailable');
    expect(res.body.raw_text).toBe('1600 Pennsylvania Ave NW Washington DC');
    expect(res.body.error_message).toBe('LLM service is unavailable');
  });

  it('should return valid when LLM parses and USPS validates successfully', async () => {
    const parsedAddress: StructuredAddress = {
      street_line_1: '1600 Pennsylvania Ave NW',
      city: 'Washington',
      state: 'DC',
      zipcode: '20500',
    };

    const validationResult: ValidationResult = {
      original_address: parsedAddress,
      standardized_address: {
        street_line_1: '1600 PENNSYLVANIA AVE NW',
        city: 'WASHINGTON',
        state: 'DC',
        zipcode: '20500',
      },
      status: 'valid',
    };

    jest.spyOn(llmParser, 'parse').mockResolvedValue(parsedAddress);
    mockUspsAdapter.validateAddress.mockResolvedValue(validationResult);

    const res = await request(app)
      .post('/api/v1/validate/parse')
      .send({ raw_address: '1600 Pennsylvania Ave NW Washington DC 20500' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('valid');
    expect(res.body.raw_text).toBe('1600 Pennsylvania Ave NW Washington DC 20500');
    expect(res.body.parsed_address).toEqual(parsedAddress);
    expect(res.body.validation_result).toEqual(validationResult);
  });

  it('should return invalid when LLM parses but USPS rejects the address', async () => {
    const parsedAddress: StructuredAddress = {
      street_line_1: '999 Fake Street',
      city: 'Nowhere',
      state: 'ZZ',
      zipcode: '00000',
    };

    const validationResult: ValidationResult = {
      original_address: parsedAddress,
      status: 'invalid',
      error_message: 'Address not found',
    };

    jest.spyOn(llmParser, 'parse').mockResolvedValue(parsedAddress);
    mockUspsAdapter.validateAddress.mockResolvedValue(validationResult);

    const res = await request(app)
      .post('/api/v1/validate/parse')
      .send({ raw_address: '999 Fake Street Nowhere ZZ 00000' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('invalid');
    expect(res.body.parsed_address).toEqual(parsedAddress);
    expect(res.body.validation_result).toEqual(validationResult);
    expect(res.body.error_message).toBe('Address not found');
  });
});
