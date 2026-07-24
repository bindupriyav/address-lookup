import axios from 'axios';
import { RealUSPSAdapter, USPSServiceError } from '../../src/adapters/realUsps';
import { StructuredAddress } from '../../src/models/address';

jest.mock('axios');
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe('RealUSPSAdapter', () => {
  let adapter: RealUSPSAdapter;

  beforeEach(() => {
    adapter = new RealUSPSAdapter('test-api-key');
    jest.clearAllMocks();
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn(
      (err: any) => err?.isAxiosError === true
    );
  });

  describe('validateAddress', () => {
    const testAddress: StructuredAddress = {
      street_line_1: '1600 Pennsylvania Ave NW',
      city: 'Washington',
      state: 'DC',
      zipcode: '20500',
    };

    it('should return a valid result when USPS API returns address data', async () => {
      mockedAxios.mockResolvedValueOnce({
        data: {
          address: {
            streetAddress: '1600 PENNSYLVANIA AVE NW',
            city: 'WASHINGTON',
            state: 'DC',
            ZIPCode: '20500',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await adapter.validateAddress(testAddress);

      expect(result.status).toBe('valid');
      expect(result.original_address).toEqual(testAddress);
      expect(result.standardized_address).toEqual({
        street_line_1: '1600 PENNSYLVANIA AVE NW',
        street_line_2: undefined,
        city: 'WASHINGTON',
        state: 'DC',
        zipcode: '20500',
      });
    });

    it('should return invalid when USPS returns empty address data', async () => {
      mockedAxios.mockResolvedValueOnce({
        data: { address: {} },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await adapter.validateAddress(testAddress);

      expect(result.status).toBe('invalid');
      expect(result.error_message).toBe('USPS could not validate this address');
    });

    it('should include street_line_2 in params when provided', async () => {
      const addressWithLine2: StructuredAddress = {
        ...testAddress,
        street_line_2: 'Suite 100',
      };

      mockedAxios.mockResolvedValueOnce({
        data: {
          address: {
            streetAddress: '1600 PENNSYLVANIA AVE NW',
            secondaryAddress: 'STE 100',
            city: 'WASHINGTON',
            state: 'DC',
            ZIPCode: '20500',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await adapter.validateAddress(addressWithLine2);

      expect(result.status).toBe('valid');
      expect(result.standardized_address?.street_line_2).toBe('STE 100');
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            secondaryAddress: 'Suite 100',
          }),
        })
      );
    });

    it('should throw USPSServiceError on HTTP error after retry', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 500, data: 'Internal Server Error' },
        message: 'Request failed with status code 500',
      };

      mockedAxios.mockRejectedValue(axiosError);

      await expect(adapter.validateAddress(testAddress)).rejects.toThrow(
        USPSServiceError
      );
    });

    it('should throw USPSServiceError on timeout after retry', async () => {
      const timeoutError = {
        isAxiosError: true,
        code: 'ECONNABORTED',
        message: 'timeout of 30000ms exceeded',
      };

      mockedAxios.mockRejectedValue(timeoutError);

      await expect(adapter.validateAddress(testAddress)).rejects.toThrow(
        'USPS API request timed out after retries'
      );
    });

    it('should retry once before failing', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 503, data: 'Service Unavailable' },
        message: 'Request failed with status code 503',
      };

      mockedAxios.mockRejectedValue(axiosError);

      await expect(adapter.validateAddress(testAddress)).rejects.toThrow(
        USPSServiceError
      );

      // Should have been called twice (initial + 1 retry)
      expect(mockedAxios).toHaveBeenCalledTimes(2);
    });

    it('should set correct headers with Bearer token and 30s timeout', async () => {
      mockedAxios.mockResolvedValueOnce({
        data: { address: { streetAddress: 'TEST', city: 'TEST', state: 'TS', ZIPCode: '00000' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await adapter.validateAddress(testAddress);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
          timeout: 30000,
        })
      );
    });
  });

  describe('verifyZipcodeCity', () => {
    it('should return match when city is valid for zipcode', async () => {
      mockedAxios.mockResolvedValueOnce({
        data: {
          'city-state': {
            city: 'WASHINGTON',
            state: 'DC',
            validCities: ['WASHINGTON'],
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await adapter.verifyZipcodeCity('20500', 'Washington');

      expect(result.status).toBe('match');
      expect(result.zipcode).toBe('20500');
      expect(result.city).toBe('Washington');
    });

    it('should return mismatch with valid cities when city does not match', async () => {
      mockedAxios.mockResolvedValueOnce({
        data: {
          'city-state': {
            city: 'SPRINGFIELD',
            state: 'IL',
            validCities: ['SPRINGFIELD', 'JEROME'],
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await adapter.verifyZipcodeCity('62704', 'Chicago');

      expect(result.status).toBe('mismatch');
      expect(result.valid_cities).toEqual(['SPRINGFIELD', 'JEROME']);
    });

    it('should use single city when validCities is not present', async () => {
      mockedAxios.mockResolvedValueOnce({
        data: {
          'city-state': {
            city: 'WASHINGTON',
            state: 'DC',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await adapter.verifyZipcodeCity('20500', 'WASHINGTON');

      expect(result.status).toBe('match');
    });

    it('should throw USPSServiceError on API failure', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 400, data: 'Bad Request' },
        message: 'Request failed with status code 400',
      };

      mockedAxios.mockRejectedValue(axiosError);

      await expect(
        adapter.verifyZipcodeCity('00000', 'Nowhere')
      ).rejects.toThrow(USPSServiceError);
    });
  });
});
