import axios, { AxiosError, AxiosResponse } from 'axios';
import { StructuredAddress } from '../models/address';
import { ValidationResult, ZipcodeCityResult } from '../models/validation';
import { USPSAdapter } from './uspsAdapter';

// USPS API base URLs
const USPS_ADDRESS_URL = 'https://api.usps.com/addresses/v3/address';
const USPS_CITY_STATE_URL = 'https://api.usps.com/addresses/v3/city-state';

// Timeout and retry configuration
const REQUEST_TIMEOUT = 30000; // 30 seconds in ms
const MAX_RETRIES = 1;
const BACKOFF_BASE = 1000; // 1 second in ms

/**
 * Error thrown when the USPS API returns an error or is unreachable.
 */
export class USPSServiceError extends Error {
  public statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'USPSServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Real USPS adapter that communicates with the USPS Address API.
 * Implements 30-second timeout and 1 retry with exponential backoff (1s base).
 */
export class RealUSPSAdapter implements USPSAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Build request headers with authorization.
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Sleep utility for backoff delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Make an HTTP request with retry logic.
   * Implements 1 retry with exponential backoff (1s base) on failure.
   */
  private async requestWithRetry(
    method: 'GET' | 'POST',
    url: string,
    options?: { params?: Record<string, string>; data?: unknown }
  ): Promise<AxiosResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await axios({
          method,
          url,
          headers: this.getHeaders(),
          params: options?.params,
          data: options?.data,
          timeout: REQUEST_TIMEOUT,
        });
        return response;
      } catch (err) {
        lastError = err as Error;

        if (axios.isAxiosError(err)) {
          const axiosErr = err as AxiosError;

          if (attempt < MAX_RETRIES) {
            const backoff = BACKOFF_BASE * Math.pow(2, attempt);
            await this.sleep(backoff);
            continue;
          }

          // Final attempt failed
          if (axiosErr.response) {
            throw new USPSServiceError(
              `USPS API returned HTTP ${axiosErr.response.status}: ${
                typeof axiosErr.response.data === 'string'
                  ? axiosErr.response.data
                  : JSON.stringify(axiosErr.response.data)
              }`,
              axiosErr.response.status
            );
          } else if (axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') {
            throw new USPSServiceError(
              'USPS API request timed out after retries'
            );
          } else {
            throw new USPSServiceError(
              `USPS API request failed: ${axiosErr.message}`
            );
          }
        }

        // Non-axios error
        if (attempt < MAX_RETRIES) {
          const backoff = BACKOFF_BASE * Math.pow(2, attempt);
          await this.sleep(backoff);
          continue;
        }

        throw new USPSServiceError(
          `USPS API request failed: ${(lastError as Error).message}`
        );
      }
    }

    // Should not reach here, but just in case
    throw new USPSServiceError(
      `USPS API request failed after ${MAX_RETRIES + 1} attempts`
    );
  }

  /**
   * Validate a structured address against the real USPS API.
   */
  async validateAddress(address: StructuredAddress): Promise<ValidationResult> {
    const params: Record<string, string> = {
      streetAddress: address.street_line_1,
      city: address.city,
      state: address.state,
      ZIPCode: address.zipcode,
    };

    if (address.street_line_2) {
      params.secondaryAddress = address.street_line_2;
    }

    try {
      const response = await this.requestWithRetry('GET', USPS_ADDRESS_URL, { params });
      return this.parseAddressResponse(response.data, address);
    } catch (err) {
      if (err instanceof USPSServiceError) {
        throw err;
      }
      throw new USPSServiceError(
        `Failed to parse USPS address validation response: ${(err as Error).message}`
      );
    }
  }

  /**
   * Verify that a city matches a given zipcode via the real USPS API.
   */
  async verifyZipcodeCity(zipcode: string, city: string): Promise<ZipcodeCityResult> {
    const params: Record<string, string> = {
      ZIPCode: zipcode,
    };

    try {
      const response = await this.requestWithRetry('GET', USPS_CITY_STATE_URL, { params });
      return this.parseCityStateResponse(response.data, zipcode, city);
    } catch (err) {
      if (err instanceof USPSServiceError) {
        throw err;
      }
      throw new USPSServiceError(
        `Failed to parse USPS city-state response: ${(err as Error).message}`
      );
    }
  }

  /**
   * Parse the USPS address validation API response.
   */
  private parseAddressResponse(
    data: Record<string, unknown>,
    originalAddress: StructuredAddress
  ): ValidationResult {
    const addressData = (data.address ?? {}) as Record<string, string>;

    if (!addressData || Object.keys(addressData).length === 0) {
      return {
        original_address: originalAddress,
        standardized_address: undefined,
        status: 'invalid',
        error_message: 'USPS could not validate this address',
      };
    }

    const standardized: StructuredAddress = {
      street_line_1: addressData.streetAddress || '',
      street_line_2: addressData.secondaryAddress || undefined,
      city: addressData.city || '',
      state: addressData.state || '',
      zipcode: addressData.ZIPCode || '',
    };

    return {
      original_address: originalAddress,
      standardized_address: standardized,
      status: 'valid',
    };
  }

  /**
   * Parse the USPS city-state API response.
   */
  private parseCityStateResponse(
    data: Record<string, unknown>,
    zipcode: string,
    city: string
  ): ZipcodeCityResult {
    const cityState = (data['city-state'] ?? data) as Record<string, unknown>;
    const validCity = (cityState.city as string) || '';
    let validCitiesList = (cityState.validCities as string[]) || [];

    // If validCities is not in the response, use the single city
    if (validCitiesList.length === 0 && validCity) {
      validCitiesList = [validCity];
    }

    // Check if the provided city matches any valid city (case-insensitive)
    const cityUpper = city.toUpperCase();
    const isMatch = validCitiesList.some((vc) => vc.toUpperCase() === cityUpper);

    if (isMatch) {
      return {
        zipcode,
        city,
        status: 'match',
      };
    } else {
      return {
        zipcode,
        city,
        status: 'mismatch',
        valid_cities: validCitiesList.length > 0 ? validCitiesList : undefined,
      };
    }
  }
}
