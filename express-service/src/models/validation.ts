import { StructuredAddress } from './address';

/**
 * Result of validating a single address against USPS.
 */
export interface ValidationResult {
  original_address: StructuredAddress;
  standardized_address?: StructuredAddress;
  status: 'valid' | 'invalid' | 'invalid_input' | 'parse_failed';
  error_message?: string;
}

/**
 * Result of verifying a zipcode-city pair.
 */
export interface ZipcodeCityResult {
  zipcode: string;
  city: string;
  status: 'match' | 'mismatch';
  valid_cities?: string[];
}

/**
 * Request body for zipcode-city verification.
 */
export interface ZipcodeCityRequest {
  zipcode: string;
  city: string;
}

/**
 * Request body for unstructured address parsing.
 */
export interface ParseRequest {
  raw_address: string;
}

/**
 * Result of parsing unstructured text and validating the parsed address.
 */
export interface ParseValidationResult {
  raw_text: string;
  parsed_address?: StructuredAddress;
  validation_result?: ValidationResult;
  status: 'valid' | 'invalid' | 'parse_failed' | 'service_unavailable';
  error_message?: string;
}

/**
 * Result of bulk address validation from an Excel file upload.
 */
export interface BulkValidationResult {
  total_rows: number;
  results: ValidationResult[];
}
