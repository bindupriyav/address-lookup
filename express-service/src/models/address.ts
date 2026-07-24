/**
 * Structured address model for USPS address validation.
 */
export interface StructuredAddress {
  street_line_1: string;
  street_line_2?: string;
  city: string;
  state: string;
  zipcode: string;
}

const DELIMITER = '|';

/**
 * Serialize a StructuredAddress to a pipe-delimited string.
 * Format: "street_line_1|street_line_2|city|state|zipcode"
 * If street_line_2 is undefined or empty, it is serialized as an empty segment.
 */
export function serializeAddress(address: StructuredAddress): string {
  const streetLine2 = address.street_line_2 ?? '';
  return [
    address.street_line_1,
    streetLine2,
    address.city,
    address.state,
    address.zipcode,
  ].join(DELIMITER);
}

/**
 * Parse a pipe-delimited string back into a StructuredAddress.
 * Expects exactly 5 segments: street_line_1|street_line_2|city|state|zipcode
 * Throws an error if the format is invalid.
 */
export function parseAddress(str: string): StructuredAddress {
  const parts = str.split(DELIMITER);
  if (parts.length !== 5) {
    throw new Error(
      `Invalid address string: expected 5 pipe-delimited segments, got ${parts.length}`
    );
  }

  const [street_line_1, street_line_2, city, state, zipcode] = parts;

  return {
    street_line_1,
    ...(street_line_2 ? { street_line_2 } : {}),
    city,
    state,
    zipcode,
  };
}
