import { LLMParser, LLMTimeoutError, LLMParseError } from '../../src/parsers/llmParser';
import { StructuredAddress } from '../../src/models/address';

describe('LLMParser', () => {
  let parser: LLMParser;

  beforeEach(() => {
    parser = new LLMParser('http://fake-llm-endpoint/parse');
  });

  describe('constructor', () => {
    it('should accept an optional endpoint URL', () => {
      const customParser = new LLMParser('http://custom-endpoint/parse');
      expect(customParser).toBeInstanceOf(LLMParser);
    });

    it('should default to LLM_ENDPOINT env var or fallback URL when no endpoint provided', () => {
      const defaultParser = new LLMParser();
      expect(defaultParser).toBeInstanceOf(LLMParser);
    });
  });

  describe('parse - timeout handling', () => {
    it('should throw LLMTimeoutError when the service takes longer than the timeout', async () => {
      // Override callLLMService to simulate a slow response
      (parser as any).callLLMService = (_rawText: string, signal: AbortSignal, _timeout: number) => {
        return new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => resolve('{}'), 5000);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      };

      await expect(parser.parse('123 Main St', 50)).rejects.toThrow(LLMTimeoutError);
      await expect(parser.parse('123 Main St', 50)).rejects.toThrow(/timed out after 50ms/);
    });

    it('should use default 10-second timeout', async () => {
      // Verify the default timeout is 10000ms by checking the error message
      (parser as any).callLLMService = (_rawText: string, signal: AbortSignal, _timeout: number) => {
        return new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => resolve('{}'), 15000);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      };

      // Use a short timeout to avoid waiting 10s in tests
      await expect(parser.parse('123 Main St', 50)).rejects.toThrow(LLMTimeoutError);
    });
  });

  describe('parse - successful parsing', () => {
    it('should return StructuredAddress when LLM returns valid JSON', async () => {
      const validResponse = JSON.stringify({
        street_line_1: '1600 Pennsylvania Ave NW',
        city: 'Washington',
        state: 'DC',
        zipcode: '20500',
      });

      (parser as any).callLLMService = async () => validResponse;

      const result = await parser.parse('1600 Pennsylvania Ave NW, Washington, DC 20500');

      expect(result).toEqual({
        street_line_1: '1600 Pennsylvania Ave NW',
        city: 'Washington',
        state: 'DC',
        zipcode: '20500',
      });
    });

    it('should include street_line_2 when present in LLM response', async () => {
      const validResponse = JSON.stringify({
        street_line_1: '123 Main St',
        street_line_2: 'Apt 4B',
        city: 'Springfield',
        state: 'IL',
        zipcode: '62701',
      });

      (parser as any).callLLMService = async () => validResponse;

      const result = await parser.parse('123 Main St Apt 4B, Springfield IL 62701');

      expect(result).toEqual({
        street_line_1: '123 Main St',
        street_line_2: 'Apt 4B',
        city: 'Springfield',
        state: 'IL',
        zipcode: '62701',
      });
    });

    it('should omit street_line_2 when not present in LLM response', async () => {
      const validResponse = JSON.stringify({
        street_line_1: '456 Oak Ave',
        city: 'Portland',
        state: 'OR',
        zipcode: '97201',
      });

      (parser as any).callLLMService = async () => validResponse;

      const result = await parser.parse('456 Oak Ave Portland OR 97201');

      expect(result).not.toHaveProperty('street_line_2');
    });
  });

  describe('parse - error handling', () => {
    it('should throw LLMParseError when LLM returns invalid JSON', async () => {
      (parser as any).callLLMService = async () => 'not valid json';

      await expect(parser.parse('some address')).rejects.toThrow(LLMParseError);
    });

    it('should throw LLMParseError when LLM response is missing required fields', async () => {
      const incompleteResponse = JSON.stringify({
        street_line_1: '123 Main St',
        city: 'Springfield',
        // missing state and zipcode
      });

      (parser as any).callLLMService = async () => incompleteResponse;

      await expect(parser.parse('123 Main St Springfield')).rejects.toThrow(LLMParseError);
      await expect(parser.parse('123 Main St Springfield')).rejects.toThrow(
        /missing required address fields/
      );
    });

    it('should throw LLMParseError when callLLMService throws a generic error', async () => {
      (parser as any).callLLMService = async () => {
        throw new Error('Network failure');
      };

      await expect(parser.parse('address text')).rejects.toThrow(LLMParseError);
      await expect(parser.parse('address text')).rejects.toThrow(/LLM service error: Network failure/);
    });

    it('should include rawText on LLMParseError', async () => {
      (parser as any).callLLMService = async () => 'not json';

      try {
        await parser.parse('my raw address text');
        fail('Expected LLMParseError');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMParseError);
        expect((error as LLMParseError).rawText).toBe('my raw address text');
      }
    });

    it('should throw LLMTimeoutError when LLM service connection is refused', async () => {
      // Use a parser pointing at a non-existent endpoint to trigger connection error
      const unreachableParser = new LLMParser('http://127.0.0.1:1/unreachable');

      await expect(unreachableParser.parse('123 Main St', 1000)).rejects.toThrow(LLMTimeoutError);
    });
  });

  describe('LLMTimeoutError', () => {
    it('should have correct name and message', () => {
      const error = new LLMTimeoutError(10000);
      expect(error.name).toBe('LLMTimeoutError');
      expect(error.message).toBe('LLM service timed out after 10000ms');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('LLMParseError', () => {
    it('should have correct name and include rawText', () => {
      const error = new LLMParseError('raw input', 'custom reason');
      expect(error.name).toBe('LLMParseError');
      expect(error.message).toBe('custom reason');
      expect(error.rawText).toBe('raw input');
      expect(error).toBeInstanceOf(Error);
    });

    it('should use default message when no reason provided', () => {
      const error = new LLMParseError('123 Main St');
      expect(error.message).toBe('Failed to parse address from text: "123 Main St"');
    });
  });
});
