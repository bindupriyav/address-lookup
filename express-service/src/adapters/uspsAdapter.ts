import { StructuredAddress } from '../models/address';
import { ValidationResult, ZipcodeCityResult } from '../models/validation';
import { config } from '../config';

/**
 * Interface for USPS address validation adapters.
 * Both mock and real implementations must conform to this interface,
 * allowing seamless swapping via configuration.
 */
export interface USPSAdapter {
  validateAddress(address: StructuredAddress): Promise<ValidationResult>;
  verifyZipcodeCity(zipcode: string, city: string): Promise<ZipcodeCityResult>;
}

/**
 * Factory function that returns the appropriate USPSAdapter implementation.
 * Uses real Census Geocoder by default. Only uses mock if USPS_API_KEY is explicitly "mock".
 */
export function getUspsAdapter(): USPSAdapter {
  if (config.uspsApiKey === 'mock') {
    const { MockUSPSAdapter } = require('./mockUsps');
    return new MockUSPSAdapter();
  }
  // Default: use real Census Geocoder (free, no key needed)
  const { RealUSPSAdapter } = require('./realUsps');
  return new RealUSPSAdapter('census');
}
