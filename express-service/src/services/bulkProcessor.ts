import * as XLSX from 'xlsx';
import { StructuredAddress } from '../models/address';
import { ValidationResult, BulkValidationResult } from '../models/validation';
import { AddressValidator } from './addressValidator';

/**
 * Processes bulk address validation from Excel file uploads.
 * Reads .xlsx/.xls files, extracts address rows, validates each via AddressValidator,
 * and returns ordered results preserving the original row order.
 */
export class BulkProcessor {
  static MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  static MAX_ROWS = 1000;

  constructor(private validator: AddressValidator) {}

  /**
   * Process an uploaded Excel file for bulk address validation.
   *
   * Steps:
   * 1. Validate file format (must be .xlsx or .xls)
   * 2. Validate file size (must be <= 10MB)
   * 3. Read Excel rows using xlsx library
   * 4. Validate row count (max 1000)
   * 5. For each row, extract address fields and validate
   * 6. Return BulkValidationResult with total_rows and ordered results
   */
  async processFile(fileBuffer: Buffer, filename: string): Promise<BulkValidationResult> {
    // 1. Validate file format
    this.validateFileFormat(filename);

    // 2. Validate file size
    this.validateFileSize(fileBuffer);

    // 3. Read Excel rows
    const rows = this.readExcelRows(fileBuffer);

    // 4. Validate row count
    this.validateRowCount(rows);

    // 5 & 6. Process each row
    const results: ValidationResult[] = [];
    for (const row of rows) {
      const result = await this.processRow(row);
      results.push(result);
    }

    // 7. Return BulkValidationResult
    return {
      total_rows: results.length,
      results,
    };
  }

  /**
   * Validate that the file has an Excel extension (.xlsx or .xls).
   */
  private validateFileFormat(filename: string): void {
    const lowerFilename = filename.toLowerCase();
    if (!lowerFilename.endsWith('.xlsx') && !lowerFilename.endsWith('.xls')) {
      throw new BulkProcessorError('INVALID_FILE_FORMAT', 'File must be in Excel format (.xlsx or .xls)');
    }
  }

  /**
   * Validate that the file size does not exceed the maximum allowed size.
   */
  private validateFileSize(fileBuffer: Buffer): void {
    if (fileBuffer.length > BulkProcessor.MAX_FILE_SIZE) {
      throw new BulkProcessorError('FILE_TOO_LARGE', `File size exceeds maximum allowed size of ${BulkProcessor.MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }
  }

  /**
   * Read and parse the Excel file buffer into row objects.
   */
  private readExcelRows(fileBuffer: Buffer): Record<string, unknown>[] {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return [];
    }
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
    return rows;
  }

  /**
   * Validate that the number of rows does not exceed the maximum allowed.
   */
  private validateRowCount(rows: Record<string, unknown>[]): void {
    if (rows.length > BulkProcessor.MAX_ROWS) {
      throw new BulkProcessorError('ROW_LIMIT_EXCEEDED', `File contains ${rows.length} rows, which exceeds the maximum of ${BulkProcessor.MAX_ROWS} rows`);
    }
  }

  /**
   * Process a single row: check for required fields, then validate via AddressValidator.
   * Returns a ValidationResult with status "invalid_input" if required fields are missing.
   */
  private async processRow(row: Record<string, unknown>): Promise<ValidationResult> {
    const streetLine1 = this.getStringField(row, 'street_line_1');
    const streetLine2 = this.getStringField(row, 'street_line_2');
    const city = this.getStringField(row, 'city');
    const state = this.getStringField(row, 'state');
    const zipcode = this.getStringField(row, 'zipcode');

    // Check for missing required fields
    const missingFields: string[] = [];
    if (!streetLine1) missingFields.push('street_line_1');
    if (!city) missingFields.push('city');
    if (!state) missingFields.push('state');
    if (!zipcode) missingFields.push('zipcode');

    if (missingFields.length > 0) {
      const address: StructuredAddress = {
        street_line_1: streetLine1 || '',
        ...(streetLine2 ? { street_line_2: streetLine2 } : {}),
        city: city || '',
        state: state || '',
        zipcode: zipcode || '',
      };

      return {
        original_address: address,
        status: 'invalid_input',
        error_message: `Missing required fields: ${missingFields.join(', ')}`,
      };
    }

    // All required fields present - validate via AddressValidator
    const address: StructuredAddress = {
      street_line_1: streetLine1,
      ...(streetLine2 ? { street_line_2: streetLine2 } : {}),
      city: city,
      state: state,
      zipcode: zipcode,
    };

    return this.validator.validate(address);
  }

  /**
   * Extract a string field from a row object, handling various data types.
   * Returns empty string if the field is not present or is null/undefined.
   */
  private getStringField(row: Record<string, unknown>, field: string): string {
    const value = row[field];
    if (value === null || value === undefined || value === '') {
      return '';
    }
    return String(value).trim();
  }
}

/**
 * Custom error class for BulkProcessor errors.
 * Contains an error_code for programmatic handling and a message for display.
 */
export class BulkProcessorError extends Error {
  constructor(
    public readonly error_code: string,
    message: string
  ) {
    super(message);
    this.name = 'BulkProcessorError';
  }
}
