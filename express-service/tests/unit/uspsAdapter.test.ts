import { USPSAdapter } from '../../src/adapters/uspsAdapter';
import { MockUSPSAdapter } from '../../src/adapters/mockUsps';
import { RealUSPSAdapter } from '../../src/adapters/realUsps';

describe('USPSAdapter interface and factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getUspsAdapter()', () => {
    it('returns MockUSPSAdapter when USPS_API_KEY is not set', () => {
      delete process.env.USPS_API_KEY;
      jest.isolateModules(() => {
        const { getUspsAdapter } = require('../../src/adapters/uspsAdapter');
        const { MockUSPSAdapter: Mock } = require('../../src/adapters/mockUsps');
        const adapter = getUspsAdapter();
        expect(adapter).toBeInstanceOf(Mock);
      });
    });

    it('returns MockUSPSAdapter when USPS_API_KEY is "mock"', () => {
      process.env.USPS_API_KEY = 'mock';
      jest.isolateModules(() => {
        const { getUspsAdapter } = require('../../src/adapters/uspsAdapter');
        const { MockUSPSAdapter: Mock } = require('../../src/adapters/mockUsps');
        const adapter = getUspsAdapter();
        expect(adapter).toBeInstanceOf(Mock);
      });
    });

    it('returns RealUSPSAdapter when USPS_API_KEY is a real key', () => {
      process.env.USPS_API_KEY = 'real-api-key-123';
      jest.isolateModules(() => {
        const { getUspsAdapter } = require('../../src/adapters/uspsAdapter');
        const { RealUSPSAdapter: Real } = require('../../src/adapters/realUsps');
        const adapter = getUspsAdapter();
        expect(adapter).toBeInstanceOf(Real);
      });
    });
  });

  describe('USPSAdapter interface compliance', () => {
    it('MockUSPSAdapter implements validateAddress and verifyZipcodeCity', () => {
      const adapter: USPSAdapter = new MockUSPSAdapter();
      expect(typeof adapter.validateAddress).toBe('function');
      expect(typeof adapter.verifyZipcodeCity).toBe('function');
    });

    it('RealUSPSAdapter implements validateAddress and verifyZipcodeCity', () => {
      const adapter: USPSAdapter = new RealUSPSAdapter('test-key');
      expect(typeof adapter.validateAddress).toBe('function');
      expect(typeof adapter.verifyZipcodeCity).toBe('function');
    });
  });
});
