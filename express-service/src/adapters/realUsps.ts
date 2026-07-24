import axios from 'axios';
import { StructuredAddress } from '../models/address';
import { ValidationResult, ZipcodeCityResult } from '../models/validation';
import { USPSAdapter } from './uspsAdapter';

// US Census Bureau Geocoder API - FREE, no API key required
const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/address';

const REQUEST_TIMEOUT = 15000; // 15 seconds

/**
 * Real address validation adapter using the US Census Bureau Geocoder API.
 * This is completely free and requires no API key.
 * It validates real US addresses against the Census database.
 */
export class RealUSPSAdapter implements USPSAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Validate a structured address against the US Census Geocoder.
   * Returns standardized address if found, invalid if not recognized.
   */
  async validateAddress(address: StructuredAddress): Promise<ValidationResult> {
    try {
      const response = await axios.get(GEOCODER_URL, {
        params: {
          street: address.street_line_1 + (address.street_line_2 ? ' ' + address.street_line_2 : ''),
          city: address.city,
          state: address.state,
          zip: address.zipcode,
          benchmark: 'Public_AR_Current',
          vintage: 'Current_Current',
          format: 'json',
        },
        timeout: REQUEST_TIMEOUT,
      });

      const result = response.data?.result;
      const matches = result?.addressMatches;

      if (matches && matches.length > 0) {
        const match = matches[0];
        const matchedAddress = match.matchedAddress || '';
        const addressComponents = match.addressComponents || {};

        const standardized: StructuredAddress = {
          street_line_1: (
            (addressComponents.preQualifier || '') + ' ' +
            (addressComponents.preDirection || '') + ' ' +
            (addressComponents.preType || '') + ' ' +
            (addressComponents.streetName || '') + ' ' +
            (addressComponents.suffixType || '') + ' ' +
            (addressComponents.suffixDirection || '') + ' ' +
            (addressComponents.suffixQualifier || '')
          ).replace(/\s+/g, ' ').trim().toUpperCase() || matchedAddress.split(',')[0]?.trim().toUpperCase() || address.street_line_1.toUpperCase(),
          city: (addressComponents.city || address.city).toUpperCase(),
          state: (addressComponents.state || address.state).toUpperCase(),
          zipcode: addressComponents.zip || address.zipcode,
        };

        // Clean up street if it came out empty
        if (!standardized.street_line_1 || standardized.street_line_1.trim() === '') {
          standardized.street_line_1 = matchedAddress.split(',')[0]?.trim().toUpperCase() || address.street_line_1.toUpperCase();
        }

        return {
          original_address: address,
          standardized_address: standardized,
          status: 'valid',
        };
      } else {
        // No matches found - address is not valid
        return {
          original_address: address,
          status: 'invalid',
          error_message: 'Address not found. The address could not be verified against US Census records.',
        };
      }
    } catch (err: any) {
      // If the API is unreachable, fall back to mock-style validation
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        return {
          original_address: address,
          status: 'invalid',
          error_message: 'Address validation service timed out. Please try again.',
        };
      }

      return {
        original_address: address,
        status: 'invalid',
        error_message: `Validation service error: ${err.message}`,
      };
    }
  }

  /**
   * Verify zipcode-city match using Census Geocoder.
   * Searches for an address in the given city/zip to confirm they match.
   */
  async verifyZipcodeCity(zipcode: string, city: string): Promise<ZipcodeCityResult> {
    try {
      // Use a generic street to test if the city/zip pair is valid
      const response = await axios.get(GEOCODER_URL, {
        params: {
          street: '1 Main St',
          city: city,
          state: '',
          zip: zipcode.substring(0, 5),
          benchmark: 'Public_AR_Current',
          vintage: 'Current_Current',
          format: 'json',
        },
        timeout: REQUEST_TIMEOUT,
      });

      const result = response.data?.result;
      const matches = result?.addressMatches;

      if (matches && matches.length > 0) {
        const matchedCity = matches[0].addressComponents?.city || '';
        if (matchedCity.toUpperCase() === city.toUpperCase()) {
          return {
            zipcode,
            city: city.toUpperCase(),
            status: 'match',
          };
        } else {
          return {
            zipcode,
            city,
            status: 'mismatch',
            valid_cities: [matchedCity.toUpperCase()],
          };
        }
      }

      // No match found - can't confirm
      return {
        zipcode,
        city: city.toUpperCase(),
        status: 'match', // Give benefit of doubt if API can't confirm
      };
    } catch {
      // On error, return match as default
      return {
        zipcode,
        city: city.toUpperCase(),
        status: 'match',
      };
    }
  }
}
