import { Router, Request, Response } from 'express';
import multer from 'multer';
import { BulkProcessor, BulkProcessorError } from '../services/bulkProcessor';

/**
 * Creates and returns an Express Router for the bulk validation endpoint.
 * POST /api/v1/validate/bulk
 *
 * Accepts multipart file upload (field name: "file") of Excel (.xlsx/.xls) files.
 * Validates file format and size constraints, then processes each address row.
 * Returns a BulkValidationResult JSON response.
 *
 * Error codes:
 * - INVALID_FILE_FORMAT: File is not .xlsx or .xls
 * - FILE_TOO_LARGE: File exceeds 10MB
 * - ROW_LIMIT_EXCEEDED: File contains more than 1000 rows
 */
export function createBulkRouter(
  bulkProcessor: BulkProcessor,
  upload: multer.Multer
): Router {
  const router = Router();

  router.post('/validate/bulk', upload.single('file'), async (req: Request, res: Response) => {
    try {
      // Check that a file was provided
      if (!req.file) {
        res.status(400).json({
          detail: {
            error_code: 'INVALID_FILE_FORMAT',
            message: 'No file uploaded. Please upload an Excel file (.xlsx or .xls).',
          },
        });
        return;
      }

      const { buffer, originalname } = req.file;

      // Process the file through the BulkProcessor
      const result = await bulkProcessor.processFile(buffer, originalname);

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof BulkProcessorError) {
        res.status(400).json({
          detail: {
            error_code: error.error_code,
            message: error.message,
          },
        });
        return;
      }

      // Handle multer file size limit error
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          detail: {
            error_code: 'FILE_TOO_LARGE',
            message: 'File size exceeds maximum allowed size of 10MB',
          },
        });
        return;
      }

      // Unexpected errors
      res.status(500).json({
        detail: {
          error_code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during bulk validation',
        },
      });
    }
  });

  return router;
}
