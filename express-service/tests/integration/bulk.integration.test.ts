import request from 'supertest';
import * as XLSX from 'xlsx';
import { app } from '../../src/app';

/**
 * Helper to create an Excel buffer from row data.
 */
function createExcelBuffer(rows: Record<string, string>[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Addresses');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

describe('POST /api/v1/validate/bulk - Integration', () => {
  it('should return 200 with results for a valid Excel file', async () => {
    const rows = [
      { street_line_1: '123 Main St', city: 'Springfield', state: 'IL', zipcode: '62701' },
      { street_line_1: '456 Oak Ave', city: 'Chicago', state: 'IL', zipcode: '60601' },
    ];
    const buffer = createExcelBuffer(rows);

    const response = await request(app)
      .post('/api/v1/validate/bulk')
      .attach('file', buffer, 'addresses.xlsx')
      .expect(200);

    expect(response.body.total_rows).toBe(2);
    expect(response.body.results).toHaveLength(2);
    expect(response.body.results[0].status).toBe('valid');
    expect(response.body.results[1].status).toBe('valid');
    expect(response.body.results[0].standardized_address.street_line_1).toBe('123 MAIN ST');
  });

  it('should return 400 for non-Excel file', async () => {
    const textBuffer = Buffer.from('this is not an excel file');

    const response = await request(app)
      .post('/api/v1/validate/bulk')
      .attach('file', textBuffer, 'data.txt')
      .expect(400);

    expect(response.body.detail.error_code).toBe('INVALID_FILE_FORMAT');
  });

  it('should return 400 when no file is uploaded', async () => {
    const response = await request(app)
      .post('/api/v1/validate/bulk')
      .expect(400);

    expect(response.body.detail.error_code).toBe('INVALID_FILE_FORMAT');
  });

  it('should handle rows with missing fields as invalid_input', async () => {
    const rows = [
      { street_line_1: '123 Main St', city: 'Springfield', state: 'IL', zipcode: '62701' },
      { street_line_1: '', city: '', state: '', zipcode: '' },
    ];
    const buffer = createExcelBuffer(rows);

    const response = await request(app)
      .post('/api/v1/validate/bulk')
      .attach('file', buffer, 'addresses.xlsx')
      .expect(200);

    expect(response.body.total_rows).toBe(2);
    expect(response.body.results[0].status).toBe('valid');
    expect(response.body.results[1].status).toBe('invalid_input');
    expect(response.body.results[1].error_message).toContain('Missing required fields');
  });
});
