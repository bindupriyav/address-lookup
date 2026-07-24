import { Router, Request, Response } from 'express';
import { AddressValidator } from '../services/addressValidator';
import { ZipcodeCityRequest } from '../models/validation';

/**
 * Regex for valid zipcode format:
 * - Exactly 5 digits (e.g., "20500")
 * - Or 5 digits + hyphen + 4 digits (e.g., "20500-0001")
 */
const ZIPCODE_REGEX = /^\d{5}(-\d{4})?$/;

/**
 * Creates the zipcode-city verification router.
 * POST /validate/zipcode-city
 */
export function createZipcodeRouter(addressValidator: AddressValidator): Router {
  const router = Router();

  router.post('/validate/zipcode-city', async (req: Request, res: Response) => {
    const { zipcode, city } = req.body as ZipcodeCityRequest;

    // Validate zipcode format
    if (!zipcode || !ZIPCODE_REGEX.test(zipcode)) {
      return res.status(400).json({
        detail: {
          error_code: 'INVALID_ZIPCODE_FORMAT',
          message: 'Zipcode must be in 5-digit format (e.g., "20500") or 5+4 format (e.g., "20500-0001")',
        },
      });
    }

    // Validate city is provided
    if (!city) {
      return res.status(400).json({
        detail: {
          error_code: 'VALIDATION_ERROR',
          message: 'City is required',
        },
      });
    }

    try {
      const result = await addressValidator.verifyZipcodeCity(zipcode, city);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({
        detail: {
          error_code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during zipcode-city verification',
        },
      });
    }
  });

  return router;
}
