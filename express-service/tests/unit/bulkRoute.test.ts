import request from 'supertest';
import * as XLSX from 'xlsx';
import { app } from '../../src/app';

/**
 * Helper to create an Excel buffer from rows of address data.
 */
function createExcelBuffer(rows: Record<string, unknown>[]): Buffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Addresses');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

describe('POST /api/v1/validate/bulk', () => {
  describe('Successful bulk validation', () => {
    it('should return 200 with BulkValidationResult for valid Excel file', async () => {
      const rows = [
        { street_line_1: '123 Main St', city: 'Springfield', state: 'IL', zipcode: '62704' },
        { street_line_1: '456 Oak Ave', city: 'Chicago', state: 'IL', zipcode: '60601' },
      ];
      const buffer = createExcelBuffer(rows);

      const response = await request(app)
        .post('/api/v1/validate/bulk')
        .attach('file', buffer, 'addresses.xlsx');

      expect(response.status).toBe(200);
      expect(response.body.total_rows).toBe(2);
      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0].status).toBe('valid');
      expect(response.body.results[1].status).toBe('valid');
    });

    it('should preserve row order in results', async () => {
      const rows = [
        { street_line_1: '111 First St', city: 'CityA', state: 'CA', zipcode: '90001' },
        { street_line_1: '222 Second St', city: 'CityB', state: 'NY', zipcode: '10001' },
        { street_line_1: '333 Third St', city: 'CityC', state: 'TX', zipcode: '73301' },
      ];
      const buffer = createExcelBuffer(rows);

      const response = await request(app)
        .post('/api/v1/validate/bulk')
        .attach('file', buffer, 'ordered.xlsx');

      expect(response.status).toBe(200);
      expect(response.body.results[0].original_address.street_line_1).toBe('111 First St');
      expect(response.body.results[1].original_address.street_line_1).toBe('222 Second St');
      expect(response.body.results[2].original_address.street_line_1).toBe('333 Third St');
    });
  });

  describe('File validation errors', () => {
    it('should return 400 with INVALID_FILE_FORMAT for no file uploaded', async () => {
      const response = await request(app)
        .post('/api/v1/validate/bulk')
        .send();

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('INVALID_FILE_FORMAT');
    });

    it('should return 400 with INVALID_FILE_FORMAT for non-Excel files', async () => {
      const response = await request(app)
        .post('/api/v1/validate/bulk')
        .attach('file', Buffer.from('csv content'), 'data.csv');

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('INVALID_FILE_FORMAT');
    });

    it('should return 400 with INVALID_FILE_FORMAT for .txt files', async () => {
      const response = await request(app)
        .post('/api/v1/validate/bulk')
        .attach('file', Buffer.from('text content'), 'file.txt');

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('INVALID_FILE_FORMAT');
    });

    it('should return 400 with ROW_LIMIT_EXCEEDED for files with >1000 rows', async () => {
      const rows = Array.from({ length: 1001 }, (_, i) => ({
        street_line_1: `${i} Main St`,
        city: 'Springfield',
        state: 'IL',
        zipcode: '62704',
      }));
      const buffer = createExcelBuffer(rows);

      const response = await request(app)
        .post('/api/v1/validate/bulk')
        .attach('file', buffer, 'toomany.xlsx');

      expect(response.status).toBe(400);
      expect(response.body.detail.error_code).toBe('ROW_LIMIT_EXCEEDED');
    });
  });

  describe('Rows with missing fields', () => {
    it('should return invalid_input status for rows missing required fields', async () => {
      const rows = [
        { street_line_1: '', city: 'Springfield', state: 'IL', zipcode: '62704' },
      ];
      const buffer = createExcelBuffer(rows);

      const response = await request(app)
        .post('/api/v1/validate/bulk')
        .attach('file', buffer, 'missing.xlsx');

      expect(response.status).toBe(200);
      expect(response.body.results[0].status).toBe('invalid_input');
      expect(response.body.results[0].error_message).toContain('street_line_1');
    });
  });

  describe('INVALID keyword handling', () => {
    it('should return invalid status for addresses with INVALID in street', async () => {
      const rows = [
        { street_line_1: 'INVALID St', city: 'Nowhere', state: 'XX', zipcode: '00000' },
      ];
      const buffer = createExcelBuffer(rows);

      const response = await request(app)
        .post('/api/v1/validate/bulk')
        .attach('file', buffer, 'invalid.xlsx');

      expect(response.status).toBe(200);
      expect(response.body.results[0].status).toBe('invalid');
    });
  });
});
