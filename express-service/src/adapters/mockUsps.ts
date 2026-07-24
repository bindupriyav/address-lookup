import { StructuredAddress } from '../models/address';
import { ValidationResult, ZipcodeCityResult } from '../models/validation';
import { USPSAdapter } from './uspsAdapter';

/**
 * Known test addresses that return deterministic standardized responses.
 */
const KNOWN_ADDRESSES: Record<string, StructuredAddress> = {
  '1600 PENNSYLVANIA AVE NW': {
    street_line_1: '1600 PENNSYLVANIA AVE NW',
    city: 'WASHINGTON',
    state: 'DC',
    zipcode: '20500',
  },
};

/**
 * Known zipcode-city pairs for mock testing.
 */
const KNOWN_ZIPCODE_CITY_PAIRS: Record<string, string[]> = {
  '20500': ['WASHINGTON'],
  '10001': ['NEW YORK'],
  '90210': ['BEVERLY HILLS'],
  '60601': ['CHICAGO'],
};

/**
 * Mock USPS adapter for development and testing.
 * Returns deterministic responses without calling the real USPS API.
 */
export class MockUSPSAdapter implements USPSAdapter {
  /**
   * Validate a structured address using mock logic.
   *
   * - Returns invalid status when street_line_1 contains "INVALID"
   * - Returns a deterministic standardized address for known test addresses
   * - Returns valid with uppercased standardized address for all other inputs
   */
  async validateAddress(address: StructuredAddress): Promise<ValidationResult> {
    // Check for "INVALID" substring in street_line_1
    if (address.street_line_1.includes('INVALID')) {
      return {
        original_address: address,
        status: 'invalid',
        error_message: 'Address not found in USPS database',
      };
    }

    // Check for known test addresses (match on uppercased street_line_1)
    const known = KNOWN_ADDRESSES[address.street_line_1.toUpperCase()];
    if (known) {
      return {
        original_address: address,
        standardized_address: known,
        status: 'valid',
      };
    }

    // Default: return valid with uppercased standardized address
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

  /**
   * Verify that a city matches a given zipcode using mock data.
   *
   * - Returns "match" for known zipcode-city pairs
   * - Returns "mismatch" with valid_cities list otherwise
   */
  async verifyZipcodeCity(zipcode: string, city: string): Promise<ZipcodeCityResult> {
    const zip5 = zipcode.substring(0, 5);
    const validCities = KNOWN_ZIPCODE_CITY_PAIRS[zip5];

    if (validCities && validCities.includes(city.toUpperCase())) {
      return {
        zipcode,
        city: city.toUpperCase(),
        status: 'match',
      };
    }

    return {
      zipcode,
      city,
      status: 'mismatch',
      valid_cities: validCities || ['UNKNOWN'],
    };
  }
}
