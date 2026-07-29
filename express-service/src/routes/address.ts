import { Router, Request, Response } from 'express';
import { StructuredAddress } from '../models/address';
import { AddressValidator } from '../services/addressValidator';
import { getCachedValidation, cacheValidation, logValidationRequest } from '../services/dynamoCache';

const REQUIRED_FIELDS: (keyof StructuredAddress)[] = [
  'street_line_1',
  'city',
  'state',
  'zipcode',
];

/**
 * Returns a list of required fields that are missing or empty in the request body.
 */
function getMissingFields(body: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const value = body[field];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      missing.push(field);
    }
  }
  return missing;
}

/**
 * Creates the address validation router.
 * POST /validate/address - Validate a single structured address via USPS.
 */
export function createAddressRouter(addressValidator: AddressValidator): Router {
  const router = Router();

  router.post('/validate/address', async (req: Request, res: Response) => {
    const body = req.body ?? {};

    // Check for missing required fields
    const missing = getMissingFields(body);
    if (missing.length > 0) {
      return res.status(400).json({
        detail: {
          error_code: 'MISSING_FIELDS',
          message: `Missing required fields: ${missing.join(', ')}`,
          fields: missing,
        },
      });
    }

    // Build the StructuredAddress from the request body
    const address: StructuredAddress = {
      street_line_1: body.street_line_1 as string,
      city: body.city as string,
      state: body.state as string,
      zipcode: body.zipcode as string,
      ...(body.street_line_2 ? { street_line_2: body.street_line_2 as string } : {}),
    };

    try {
      // Check DynamoDB cache first
      const cached = await getCachedValidation(address);
      if (cached) {
        // Log the cache hit
        logValidationRequest('/api/v1/validate/address', address, cached, 200);
        return res.status(200).json(cached);
      }

      // Cache miss — call USPS adapter
      const result = await addressValidator.validate(address);

      // Store in DynamoDB cache for future lookups
      cacheValidation(address, result);

      // Log the request
      logValidationRequest('/api/v1/validate/address', address, result, 200);

      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({
        detail: {
          error_code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during address validation',
        },
      });
    }
  });

  return router;
}
