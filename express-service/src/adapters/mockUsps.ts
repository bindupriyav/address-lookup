import { StructuredAddress } from '../models/address';
import { ValidationResult, ZipcodeCityResult } from '../models/validation';
import { USPSAdapter } from './uspsAdapter';
import seedData from '../data/seed-addresses.json';

/**
 * Valid US state codes for validation.
 */
const VALID_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY'
]);

/**
 * Known zipcode-city pairs for mock verification.
 */
const ZIPCODE_CITY_MAP: Record<string, string[]> = {
  '20500': ['WASHINGTON'],
  '10001': ['NEW YORK'],
  '10005': ['NEW YORK'],
  '10007': ['NEW YORK'],
  '10118': ['NEW YORK'],
  '90210': ['BEVERLY HILLS'],
  '60601': ['CHICAGO'],
  '60606': ['CHICAGO'],
  '95014': ['CUPERTINO'],
  '94025': ['MENLO PARK'],
  '98109': ['SEATTLE'],
  '98052': ['REDMOND'],
  '78701': ['AUSTIN'],
  '94304': ['PALO ALTO'],
  '91608': ['UNIVERSAL CITY'],
  '92802': ['ANAHEIM'],
  '02139': ['CAMBRIDGE'],
  '48105': ['ANN ARBOR'],
  '94105': ['SAN FRANCISCO'],
  '94103': ['SAN FRANCISCO'],
  '33612': ['TAMPA'],
  '33613': ['TAMPA'],
  '62701': ['SPRINGFIELD'],
};

/**
 * Build a lookup map from seed data for known addresses.
 */
const SEED_LOOKUP = new Map<string, typeof seedData[0]>();
for (const entry of seedData) {
  const key = entry.street_line_1.toUpperCase().trim();
  SEED_LOOKUP.set(key, entry);
}

/**
 * Mock USPS adapter using seed data for realistic responses.
 */
export class MockUSPSAdapter implements USPSAdapter {

  async validateAddress(address: StructuredAddress): Promise<ValidationResult> {
    // Check for INVALID keyword
    if (address.street_line_1.toUpperCase().includes('INVALID')) {
      return {
        original_address: address,
        status: 'invalid',
        error_message: 'Address not found in USPS database',
      };
    }

    // Check for invalid state code
    if (!VALID_STATES.has(address.state.toUpperCase())) {
      return {
        original_address: address,
        status: 'invalid',
        error_message: `Invalid state code: ${address.state}`,
      };
    }

    // Look up in seed data
    const key = address.street_line_1.toUpperCase().trim();
    const seedEntry = SEED_LOOKUP.get(key);

    if (seedEntry && seedEntry.valid && seedEntry.standardized) {
      return {
        original_address: address,
        standardized_address: seedEntry.standardized as StructuredAddress,
        status: 'valid',
      };
    }

    if (seedEntry && !seedEntry.valid) {
      return {
        original_address: address,
        status: 'invalid',
        error_message: seedEntry.error_message || 'Address not found in USPS database',
      };
    }

    // Default: standardize (uppercase) any address with valid state
    const standardized: StructuredAddress = {
      street_line_1: address.street_line_1.toUpperCase(),
      ...(address.street_line_2 ? { street_line_2: address.street_line_2.toUpperCase() } : {}),
      city: address.city.toUpperCase(),
      state: address.state.toUpperCase(),
      zipcode: address.zipcode,
    };

    return {
      original_address: address,
      standardized_address: standardized,
      status: 'valid',
    };
  }

  async verifyZipcodeCity(zipcode: string, city: string): Promise<ZipcodeCityResult> {
    const zip5 = zipcode.substring(0, 5);
    const validCities = ZIPCODE_CITY_MAP[zip5];

    if (validCities && validCities.includes(city.toUpperCase())) {
      return {
        zipcode,
        city: city.toUpperCase(),
        status: 'match',
      };
    }

    if (validCities) {
      return {
        zipcode,
        city,
        status: 'mismatch',
        valid_cities: validCities,
      };
    }

    // Unknown zipcode
    return {
      zipcode,
      city,
      status: 'mismatch',
      valid_cities: ['UNKNOWN'],
    };
  }
}
