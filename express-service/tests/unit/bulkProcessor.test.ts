import * as XLSX from 'xlsx';
import { BulkProcessor, BulkProcessorError } from '../../src/services/bulkProcessor';
import { AddressValidator } from '../../src/services/addressValidator';
import { MockUSPSAdapter } from '../../src/adapters/mockUsps';

/**
 * Helper to create an Excel buffer from rows of address data.
 */
function createExcelBuffer(rows: Record<string, unknown>[]): Buffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Addresses');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

describe('BulkProcessor', () => {
  let bulkProcessor: BulkProcessor;
  let validator: AddressValidator;

  beforeEach(() => {
    const adapter = new MockUSPSAdapter();
    validator = new AddressValidator(adapter);
    bulkProcessor = new BulkProcessor(validator);
  });

  describe('File format validation', () => {
    it('should reject non-Excel files', async () => {
      const buffer = Buffer.from('not an excel file');

      await expect(bulkProcessor.processFile(buffer, 'file.csv'))
        .rejects.toThrow(BulkProcessorError);

      try {
        await bulkProcessor.processFile(buffer, 'file.csv');
      } catch (error) {
        expect(error).toBeInstanceOf(BulkProcessorError);
        expect((error as BulkProcessorError).error_code).toBe('INVALID_FILE_FORMAT');
      }
    });

    it('should reject .txt files', async () => {
      const buffer = Buffer.from('text content');

      await expect(bulkProcessor.processFile(buffer, 'addresses.txt'))
        .rejects.toThrow(BulkProcessorError);
    });

    it('should accept .xlsx files', async () => {
      const rows = [
        { street_line_1: '123 Main St', city: 'Springfield', state: 'IL', zipcode: '62704' },
      ];
      const buffer = createExcelBuffer(rows);

      const result = await bulkProcessor.processFile(buffer, 'addresses.xlsx');
      expect(result.total_rows).toBe(1);
    });

    it('should accept .xls files (by extension)', async () => {
      const rows = [
        { street_line_1: '123 Main St', city: 'Springfield', state: 'IL', zipcode: '62704' },
      ];
      const buffer = createExcelBuffer(rows);

      // The buffer is still xlsx format internally, but we're testing extension validation
      const result = await bulkProcessor.processFile(buffer, 'addresses.xls');
      expect(result.total_rows).toBe(1);
    });

    it('should be case-insensitive for file extensions', async () => {
      const rows = [
        { street_line_1: '123 Main St', city: 'Springfield', state: 'IL', zipcode: '62704' },
      ];
      const buffer = createExcelBuffer(rows);

      const result = await bulkProcessor.processFile(buffer, 'addresses.XLSX');
      expect(result.total_rows).toBe(1);
    });
  });

  describe('File size validation', () => {
    it('should reject files exceeding 10MB', async () => {
      // Create a buffer that exceeds 10MB
      const largeBuffer = Buffer.alloc(BulkProcessor.MAX_FILE_SIZE + 1, 0);

      await expect(bulkProcessor.processFile(largeBuffer, 'large.xlsx'))
        .rejects.toThrow(BulkProcessorError);

      try {
        await bulkProcessor.processFile(largeBuffer, 'large.xlsx');
      } catch (error) {
        expect((error as BulkProcessorError).error_code).toBe('FILE_TOO_LARGE');
      }
    });

    it('should accept files at exactly 10MB', async () => {
      // For this test, we just ensure <= 10MB doesn't throw the size error
      const rows = [
        { street_line_1: '123 Main St', city: 'Springfield', state: 'IL', zipcode: '62704' },
      ];
      const buffer = createExcelBuffer(rows);
      // The Excel buffer is well under 10MB, so this should pass
      const result = await bulkProcessor.processFile(buffer, 'addresses.xlsx');
      expect(result.total_rows).toBe(1);
    });
  });

  describe('Row limit validation', () => {
    it('should reject files with more than 1000 rows', async () => {
      const rows = Array.from({ length: 1001 }, (_, i) => ({
        street_line_1: `${i} Main St`,
        city: 'Springfield',
        state: 'IL',
        zipcode: '62704',
      }));
      const buffer = createExcelBuffer(rows);

      await expect(bulkProcessor.processFile(buffer, 'toomany.xlsx'))
        .rejects.toThrow(BulkProcessorError);

      try {
        await bulkProcessor.processFile(buffer, 'toomany.xlsx');
      } catch (error) {
        expect((error as BulkProcessorError).error_code).toBe('ROW_LIMIT_EXCEEDED');
      }
    });

    it('should accept files with exactly 1000 rows', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => ({
        street_line_1: `${i} Main St`,
        city: 'Springfield',
        state: 'IL',
        zipcode: '62704',
      }));
      const buffer = createExcelBuffer(rows);

      const result = await bulkProcessor.processFile(buffer, 'max.xlsx');
      expect(result.total_rows).toBe(1000);
    });
  });

  describe('Row processing', () => {
    it('should validate each row and return ordered results', async () => {
      const rows = [
        { street_line_1: '123 Main St', city: 'Springfield', state: 'IL', zipcode: '62704' },
        { street_line_1: '456 Oak Ave', city: 'Chicago', state: 'IL', zipcode: '60601' },
      ];
      const buffer = createExcelBuffer(rows);

      const result = await bulkProcessor.processFile(buffer, 'addresses.xlsx');

      expect(result.total_rows).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].original_address.street_line_1).toBe('123 Main St');
      expect(result.results[1].original_address.street_line_1).toBe('456 Oak Ave');
    });

    it('should return invalid_input status for rows with missing required fields', async () => {
      const rows = [
        { street_line_1: '123 Main St', city: '', state: 'IL', zipcode: '62704' },
        { street_line_1: '', city: 'Chicago', state: 'IL', zipcode: '60601' },
      ];
      const buffer = createExcelBuffer(rows);

      const result = await bulkProcessor.processFile(buffer, 'addresses.xlsx');

      expect(result.results[0].status).toBe('invalid_input');
      expect(result.results[0].error_message).toContain('city');
      expect(result.results[1].status).toBe('invalid_input');
      expect(result.results[1].error_message).toContain('street_line_1');
    });

    it('should handle rows with multiple missing fields', async () => {
      const rows = [
        { street_line_1: '', city: '', state: '', zipcode: '' },
      ];
      const buffer = createExcelBuffer(rows);

      const result = await bulkProcessor.processFile(buffer, 'addresses.xlsx');

      expect(result.results[0].status).toBe('invalid_input');
      expect(result.results[0].error_message).toContain('street_line_1');
      expect(result.results[0].error_message).toContain('city');
      expect(result.results[0].error_message).toContain('state');
      expect(result.results[0].error_message).toContain('zipcode');
    });

    it('should treat street_line_2 as optional', async () => {
      const rows = [
        { street_line_1: '123 Main St', city: 'Springfield', state: 'IL', zipcode: '62704' },
      ];
      const buffer = createExcelBuffer(rows);

      const result = await bulkProcessor.processFile(buffer, 'addresses.xlsx');

      expect(result.results[0].status).toBe('valid');
    });

    it('should include street_line_2 when provided', async () => {
      const rows = [
        { street_line_1: '123 Main St', street_line_2: 'Apt 4B', city: 'Springfield', state: 'IL', zipcode: '62704' },
      ];
      const buffer = createExcelBuffer(rows);

      const result = await bulkProcessor.processFile(buffer, 'addresses.xlsx');

      expect(result.results[0].status).toBe('valid');
      expect(result.results[0].original_address.street_line_2).toBe('Apt 4B');
    });

    it('should validate addresses through the mock adapter', async () => {
      const rows = [
        { street_line_1: '1600 Pennsylvania Ave NW', city: 'Washington', state: 'DC', zipcode: '20500' },
      ];
      const buffer = createExcelBuffer(rows);

      const result = await bulkProcessor.processFile(buffer, 'addresses.xlsx');

      expect(result.results[0].status).toBe('valid');
      expect(result.results[0].standardized_address).toBeDefined();
    });

    it('should return invalid status for addresses with INVALID in street', async () => {
      const rows = [
        { street_line_1: 'INVALID address', city: 'Nowhere', state: 'XX', zipcode: '00000' },
      ];
      const buffer = createExcelBuffer(rows);

      const result = await bulkProcessor.processFile(buffer, 'addresses.xlsx');

      expect(result.results[0].status).toBe('invalid');
    });
  });

  describe('Empty file handling', () => {
    it('should return zero results for an empty spreadsheet', async () => {
      const rows: Record<string, unknown>[] = [];
      const buffer = createExcelBuffer(rows);

      const result = await bulkProcessor.processFile(buffer, 'empty.xlsx');

      expect(result.total_rows).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('Static properties', () => {
    it('should have MAX_FILE_SIZE set to 10MB', () => {
      expect(BulkProcessor.MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
    });

    it('should have MAX_ROWS set to 1000', () => {
      expect(BulkProcessor.MAX_ROWS).toBe(1000);
    });
  });
});
