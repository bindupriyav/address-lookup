import { MockUSPSAdapter } from '../../src/adapters/mockUsps';
import { StructuredAddress } from '../../src/models/address';

describe('MockUSPSAdapter', () => {
  let adapter: MockUSPSAdapter;

  beforeEach(() => {
    adapter = new MockUSPSAdapter();
  });

  describe('validateAddress', () => {
    it('returns invalid status when street_line_1 contains "INVALID"', async () => {
      const address: StructuredAddress = {
        street_line_1: '123 INVALID ST',
        city: 'Anytown',
        state: 'CA',
        zipcode: '90210',
      };

      const result = await adapter.validateAddress(address);

      expect(result.status).toBe('invalid');
      expect(result.original_address).toEqual(address);
      expect(result.standardized_address).toBeUndefined();
      expect(result.error_message).toBe('Address not found in USPS database');
    });

    it('returns deterministic standardized address for known test address', async () => {
      const address: StructuredAddress = {
        street_line_1: '1600 Pennsylvania Ave NW',
        city: 'Washington',
        state: 'DC',
        zipcode: '20500',
      };

      const result = await adapter.validateAddress(address);

      expect(result.status).toBe('valid');
      expect(result.standardized_address).toEqual({
        street_line_1: '1600 PENNSYLVANIA AVE NW',
        city: 'WASHINGTON',
        state: 'DC',
        zipcode: '20500',
      });
    });

    it('returns valid with uppercased standardized address for unknown addresses', async () => {
      const address: StructuredAddress = {
        street_line_1: '123 Main St',
        street_line_2: 'Apt 4B',
        city: 'Springfield',
        state: 'IL',
        zipcode: '62701',
      };

      const result = await adapter.validateAddress(address);

      expect(result.status).toBe('valid');
      expect(result.original_address).toEqual(address);
      expect(result.standardized_address).toEqual({
        street_line_1: '123 MAIN ST',
        street_line_2: 'APT 4B',
        city: 'SPRINGFIELD',
        state: 'IL',
        zipcode: '62701',
      });
    });

    it('does not include street_line_2 in standardized address when not provided', async () => {
      const address: StructuredAddress = {
        street_line_1: '456 Oak Ave',
        city: 'Portland',
        state: 'OR',
        zipcode: '97201',
      };

      const result = await adapter.validateAddress(address);

      expect(result.status).toBe('valid');
      expect(result.standardized_address?.street_line_2).toBeUndefined();
    });
  });

  describe('verifyZipcodeCity', () => {
    it('returns match for known zipcode-city pair "20500"/"Washington"', async () => {
      const result = await adapter.verifyZipcodeCity('20500', 'Washington');

      expect(result.status).toBe('match');
      expect(result.zipcode).toBe('20500');
      expect(result.city).toBe('WASHINGTON');
    });

    it('returns match for known zipcode-city pair "10001"/"New York"', async () => {
      const result = await adapter.verifyZipcodeCity('10001', 'New York');

      expect(result.status).toBe('match');
      expect(result.zipcode).toBe('10001');
      expect(result.city).toBe('NEW YORK');
    });

    it('returns mismatch with valid_cities when city does not match', async () => {
      const result = await adapter.verifyZipcodeCity('20500', 'New York');

      expect(result.status).toBe('mismatch');
      expect(result.zipcode).toBe('20500');
      expect(result.city).toBe('New York');
      expect(result.valid_cities).toEqual(['WASHINGTON']);
    });

    it('returns mismatch with ["UNKNOWN"] for unrecognized zipcode', async () => {
      const result = await adapter.verifyZipcodeCity('99999', 'Nowhere');

      expect(result.status).toBe('mismatch');
      expect(result.valid_cities).toEqual(['UNKNOWN']);
    });

    it('handles 5+4 zipcode format by using first 5 digits', async () => {
      const result = await adapter.verifyZipcodeCity('20500-0001', 'Washington');

      expect(result.status).toBe('match');
      expect(result.city).toBe('WASHINGTON');
    });
  });
});
