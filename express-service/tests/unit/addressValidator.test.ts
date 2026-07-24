import { AddressValidator } from '../../src/services/addressValidator';
import { StructuredAddress } from '../../src/models/address';
import { ValidationResult, ZipcodeCityResult } from '../../src/models/validation';
import { USPSAdapter } from '../../src/adapters/uspsAdapter';

describe('AddressValidator', () => {
  let mockAdapter: USPSAdapter;
  let validator: AddressValidator;

  beforeEach(() => {
    mockAdapter = {
      validateAddress: jest.fn(),
      verifyZipcodeCity: jest.fn(),
    };
    validator = new AddressValidator(mockAdapter);
  });

  describe('validate()', () => {
    it('should delegate to uspsAdapter.validateAddress and return the result', async () => {
      const address: StructuredAddress = {
        street_line_1: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipcode: '62701',
      };

      const expectedResult: ValidationResult = {
        original_address: address,
        standardized_address: {
          street_line_1: '123 MAIN ST',
          city: 'SPRINGFIELD',
          state: 'IL',
          zipcode: '62701',
        },
        status: 'valid',
      };

      (mockAdapter.validateAddress as jest.Mock).mockResolvedValue(expectedResult);

      const result = await validator.validate(address);

      expect(mockAdapter.validateAddress).toHaveBeenCalledWith(address);
      expect(result).toEqual(expectedResult);
    });

    it('should return invalid result when adapter returns invalid', async () => {
      const address: StructuredAddress = {
        street_line_1: 'INVALID ADDRESS',
        city: 'Nowhere',
        state: 'XX',
        zipcode: '00000',
      };

      const expectedResult: ValidationResult = {
        original_address: address,
        status: 'invalid',
        error_message: 'Address not found in USPS database',
      };

      (mockAdapter.validateAddress as jest.Mock).mockResolvedValue(expectedResult);

      const result = await validator.validate(address);

      expect(result.status).toBe('invalid');
      expect(result.error_message).toBeDefined();
    });
  });

  describe('verifyZipcodeCity()', () => {
    it('should delegate to uspsAdapter.verifyZipcodeCity and return the result', async () => {
      const expectedResult: ZipcodeCityResult = {
        zipcode: '20500',
        city: 'WASHINGTON',
        status: 'match',
      };

      (mockAdapter.verifyZipcodeCity as jest.Mock).mockResolvedValue(expectedResult);

      const result = await validator.verifyZipcodeCity('20500', 'Washington');

      expect(mockAdapter.verifyZipcodeCity).toHaveBeenCalledWith('20500', 'Washington');
      expect(result).toEqual(expectedResult);
    });

    it('should return mismatch with valid_cities when city does not match', async () => {
      const expectedResult: ZipcodeCityResult = {
        zipcode: '20500',
        city: 'New York',
        status: 'mismatch',
        valid_cities: ['WASHINGTON'],
      };

      (mockAdapter.verifyZipcodeCity as jest.Mock).mockResolvedValue(expectedResult);

      const result = await validator.verifyZipcodeCity('20500', 'New York');

      expect(result.status).toBe('mismatch');
      expect(result.valid_cities).toContain('WASHINGTON');
    });
  });

  describe('checkAddress()', () => {
    it('should convert address string to uppercase', () => {
      expect(validator.checkAddress('123 main street')).toBe('123 MAIN STREET');
    });

    it('should return empty string for empty input', () => {
      expect(validator.checkAddress('')).toBe('');
    });

    it('should handle already uppercase input', () => {
      expect(validator.checkAddress('123 MAIN STREET')).toBe('123 MAIN STREET');
    });

    it('should handle mixed case input', () => {
      expect(validator.checkAddress('123 Main St, Apt 4B')).toBe('123 MAIN ST, APT 4B');
    });
  });

  describe('verifyAddress()', () => {
    it('should convert address string to uppercase', () => {
      expect(validator.verifyAddress('456 oak avenue')).toBe('456 OAK AVENUE');
    });

    it('should return empty string for empty input', () => {
      expect(validator.verifyAddress('')).toBe('');
    });

    it('should handle already uppercase input', () => {
      expect(validator.verifyAddress('456 OAK AVENUE')).toBe('456 OAK AVENUE');
    });
  });

  describe('checkAddress and verifyAddress consistency', () => {
    it('should produce identical output for identical input', () => {
      const inputs = [
        '123 Main St',
        '',
        'APT 4B, 789 PINE DR',
        'mixed Case Address 123',
      ];

      for (const input of inputs) {
        expect(validator.checkAddress(input)).toBe(validator.verifyAddress(input));
      }
    });
  });
});
