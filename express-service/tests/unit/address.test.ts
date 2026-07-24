import {
  StructuredAddress,
  serializeAddress,
  parseAddress,
} from '../../src/models/address';

describe('StructuredAddress serialization', () => {
  it('should serialize an address with all fields to pipe-delimited string', () => {
    const address: StructuredAddress = {
      street_line_1: '1600 Pennsylvania Ave NW',
      street_line_2: 'Suite 100',
      city: 'Washington',
      state: 'DC',
      zipcode: '20500',
    };

    const result = serializeAddress(address);
    expect(result).toBe('1600 Pennsylvania Ave NW|Suite 100|Washington|DC|20500');
  });

  it('should serialize an address without street_line_2 using empty segment', () => {
    const address: StructuredAddress = {
      street_line_1: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zipcode: '62701',
    };

    const result = serializeAddress(address);
    expect(result).toBe('123 Main St||Springfield|IL|62701');
  });

  it('should parse a pipe-delimited string with street_line_2 back to StructuredAddress', () => {
    const str = '1600 Pennsylvania Ave NW|Suite 100|Washington|DC|20500';
    const result = parseAddress(str);

    expect(result).toEqual({
      street_line_1: '1600 Pennsylvania Ave NW',
      street_line_2: 'Suite 100',
      city: 'Washington',
      state: 'DC',
      zipcode: '20500',
    });
  });

  it('should parse a pipe-delimited string without street_line_2', () => {
    const str = '123 Main St||Springfield|IL|62701';
    const result = parseAddress(str);

    expect(result).toEqual({
      street_line_1: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zipcode: '62701',
    });
    expect(result.street_line_2).toBeUndefined();
  });

  it('should round-trip serialize and parse correctly', () => {
    const original: StructuredAddress = {
      street_line_1: '456 Oak Ave',
      street_line_2: 'Apt 2B',
      city: 'Portland',
      state: 'OR',
      zipcode: '97201',
    };

    const roundTripped = parseAddress(serializeAddress(original));
    expect(roundTripped).toEqual(original);
  });

  it('should round-trip an address without street_line_2', () => {
    const original: StructuredAddress = {
      street_line_1: '789 Elm St',
      city: 'Denver',
      state: 'CO',
      zipcode: '80201',
    };

    const roundTripped = parseAddress(serializeAddress(original));
    expect(roundTripped).toEqual(original);
  });

  it('should throw an error for invalid string format', () => {
    expect(() => parseAddress('not|enough|segments')).toThrow(
      'Invalid address string: expected 5 pipe-delimited segments, got 3'
    );
  });

  it('should throw an error for too many segments', () => {
    expect(() => parseAddress('a|b|c|d|e|f')).toThrow(
      'Invalid address string: expected 5 pipe-delimited segments, got 6'
    );
  });
});
