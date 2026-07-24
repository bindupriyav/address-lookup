import { StructuredAddress } from '../models/address';
import { ValidationResult, ZipcodeCityResult } from '../models/validation';
import { USPSAdapter } from '../adapters/uspsAdapter';

/**
 * Core address validation service that orchestrates USPS validation
 * and provides address normalization utilities.
 */
export class AddressValidator {
  constructor(private uspsAdapter: USPSAdapter) {}

  /**
   * Validate a structured address via the USPS adapter.
   * Delegates to the configured USPS adapter and returns the validation result.
   */
  async validate(address: StructuredAddress): Promise<ValidationResult> {
    return this.uspsAdapter.validateAddress(address);
  }

  /**
   * Verify that a city matches a given zipcode via the USPS adapter.
   * Delegates to the configured USPS adapter and returns the result.
   */
  async verifyZipcodeCity(zipcode: string, city: string): Promise<ZipcodeCityResult> {
    return this.uspsAdapter.verifyZipcodeCity(zipcode, city);
  }

  /**
   * Normalize an address string to uppercase.
   * Returns the input converted to uppercase.
   */
  checkAddress(address: string): string {
    return address.toUpperCase();
  }

  /**
   * Normalize an address string to uppercase (identical behavior to checkAddress).
   * Returns the input converted to uppercase.
   */
  verifyAddress(address: string): string {
    return address.toUpperCase();
  }
}
