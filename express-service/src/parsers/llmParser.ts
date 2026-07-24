import axios, { AxiosError } from 'axios';
import { StructuredAddress } from '../models/address';

/**
 * Custom error thrown when the LLM service times out.
 */
export class LLMTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`LLM service timed out after ${timeoutMs}ms`);
    this.name = 'LLMTimeoutError';
  }
}

/**
 * Custom error thrown when the LLM fails to parse the address text.
 */
export class LLMParseError extends Error {
  public readonly rawText: string;

  constructor(rawText: string, reason?: string) {
    super(reason ?? `Failed to parse address from text: "${rawText}"`);
    this.name = 'LLMParseError';
    this.rawText = rawText;
  }
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'http://localhost:8081/parse-address';

/**
 * LLM-powered address parser that extracts structured address fields
 * from unstructured or messy address text.
 *
 * Accepts a configurable endpoint URL for testability.
 */
export class LLMParser {
  private readonly endpoint: string;

  /**
   * @param endpoint - The LLM service endpoint URL. Defaults to LLM_ENDPOINT env var or http://localhost:8081/parse-address
   */
  constructor(endpoint?: string) {
    this.endpoint = endpoint ?? DEFAULT_LLM_ENDPOINT;
  }

  /**
   * Parse unstructured address text into a StructuredAddress using an LLM service.
   *
   * @param rawText - The unstructured address text to parse
   * @param timeout - Timeout in milliseconds (default: 10000ms / 10 seconds)
   * @returns A StructuredAddress extracted from the raw text
   * @throws LLMTimeoutError if the LLM service does not respond within the timeout
   * @throws LLMParseError if the LLM response cannot be parsed into a valid address
   */
  async parse(rawText: string, timeout: number = DEFAULT_TIMEOUT_MS): Promise<StructuredAddress> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const result = await this.callLLMService(rawText, controller.signal, timeout);
      clearTimeout(timeoutId);
      return this.extractAddress(result, rawText);
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof LLMTimeoutError || error instanceof LLMParseError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMTimeoutError(timeout);
      }

      throw new LLMParseError(rawText, `LLM service error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Call the external LLM service to parse address text.
   * Uses axios with timeout and abort signal support.
   */
  protected async callLLMService(rawText: string, signal: AbortSignal, timeout: number): Promise<string> {
    // Check if already aborted before proceeding
    if (signal.aborted) {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }

    try {
      const response = await axios.post(
        this.endpoint,
        { raw_address: rawText },
        {
          timeout,
          signal,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      // Return the response data as a JSON string for extractAddress to parse
      if (typeof response.data === 'string') {
        return response.data;
      }
      return JSON.stringify(response.data);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        // Timeout or cancelled request → service unavailable
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ERR_CANCELED') {
          throw new LLMTimeoutError(timeout);
        }

        // Network errors (connection refused, DNS failure, etc.) → service unavailable
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND' || !axiosError.response) {
          throw new LLMTimeoutError(timeout);
        }

        // Server returned an error response → parse failed
        throw new LLMParseError(rawText, `LLM service returned error: ${axiosError.response?.status ?? 'unknown'}`);
      }

      // AbortError from signal
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      throw error;
    }
  }

  /**
   * Extract a StructuredAddress from the LLM response text.
   * Expects the LLM to return JSON with address fields.
   */
  private extractAddress(llmResponse: string, rawText: string): StructuredAddress {
    try {
      const parsed = JSON.parse(llmResponse);

      if (!parsed.street_line_1 || !parsed.city || !parsed.state || !parsed.zipcode) {
        throw new LLMParseError(rawText, 'LLM response missing required address fields');
      }

      return {
        street_line_1: parsed.street_line_1,
        ...(parsed.street_line_2 ? { street_line_2: parsed.street_line_2 } : {}),
        city: parsed.city,
        state: parsed.state,
        zipcode: parsed.zipcode,
      };
    } catch (error: unknown) {
      if (error instanceof LLMParseError) {
        throw error;
      }
      throw new LLMParseError(rawText, 'Failed to parse LLM response as structured address');
    }
  }
}
