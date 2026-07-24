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
 * Factory function that returns the appropriate USPSAdapter implementation
 * based on the USPS_API_KEY environment variable.
 *
 * - Returns MockUSPSAdapter when USPS_API_KEY is "mock" or unset
 * - Returns RealUSPSAdapter when USPS_API_KEY is set to a real key value
 */
export function getUspsAdapter(): USPSAdapter {
  if (config.uspsApiKey === 'mock' || !config.uspsApiKey) {
    const { MockUSPSAdapter } = require('./mockUsps');
    return new MockUSPSAdapter();
  }
  const { RealUSPSAdapter } = require('./realUsps');
  return new RealUSPSAdapter(config.uspsApiKey);
}
