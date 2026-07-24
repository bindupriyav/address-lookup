/**
 * Route for LLM-powered address parsing and validation endpoint.
 *
 * Exposes POST /validate/parse which accepts raw unstructured address text,
 * parses it via the LLM parser into structured fields, then validates the
 * parsed address via USPS.
 */

import { Router, Request, Response } from 'express';
import { AddressValidator } from '../services/addressValidator';
import { LLMParser, LLMTimeoutError, LLMParseError } from '../parsers/llmParser';
import { ParseRequest, ParseValidationResult } from '../models/validation';

/**
 * Create the parse router with injected dependencies.
 *
 * @param addressValidator - The address validation service
 * @param llmParser - The LLM-powered address parser
 * @returns Express Router handling POST /validate/parse
 */
export function createParseRouter(addressValidator: AddressValidator, llmParser: LLMParser): Router {
  const router = Router();

  router.post('/validate/parse', async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Partial<ParseRequest>;

    // Validate request body
    if (!body.raw_address || typeof body.raw_address !== 'string') {
      res.status(400).json({
        detail: {
          error_code: 'VALIDATION_ERROR',
          message: 'raw_address is required and must be a string',
        },
      });
      return;
    }

    const rawText = body.raw_address;

    // Step 1: Parse raw text into structured address via LLM
    try {
      const parsedAddress = await llmParser.parse(rawText);

      // Step 2: Validate the parsed address via USPS
      const validationResult = await addressValidator.validate(parsedAddress);

      // Determine overall status based on validation result
      const status = validationResult.status === 'valid' || validationResult.status === 'invalid'
        ? validationResult.status
        : 'invalid';

      const result: ParseValidationResult = {
        raw_text: rawText,
        parsed_address: parsedAddress,
        validation_result: validationResult,
        status,
        error_message: validationResult.error_message,
      };

      res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof LLMTimeoutError) {
        const result: ParseValidationResult = {
          raw_text: rawText,
          parsed_address: undefined,
          validation_result: undefined,
          status: 'service_unavailable',
          error_message: 'LLM service is unavailable',
        };
        res.status(200).json(result);
        return;
      }

      if (error instanceof LLMParseError) {
        const result: ParseValidationResult = {
          raw_text: rawText,
          parsed_address: undefined,
          validation_result: undefined,
          status: 'parse_failed',
          error_message: error.message,
        };
        res.status(200).json(result);
        return;
      }

      // Unexpected error
      res.status(500).json({
        detail: {
          error_code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  });

  return router;
}
